"""Docking contracts, API boundaries and real SQLite lineage; native science is remote."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.assets import AssetStore
from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.options import DockingOptions, SearchBox, arguments
from opendde_workbench.docking.runtime import configuration, validate
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.native_arguments import needs_gpu
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from opendde_workbench.workflows.contracts import PlanInput


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64}


def task():
    receptor, ligand = reference(), reference()
    return {
        "operation": "docking",
        "name": "poses",
        "receptor": receptor,
        "ligand": ligand,
        "search": {
            "kind": "box",
            "frame": receptor,
            "box": {"center": [1, 2, 3], "size": [20, 20, 20]},
        },
    }


def test_exact_frame_budgets_and_single_registered_engine():
    value = task()
    request = TASK_ADAPTER.validate_python(value)
    assert isinstance(request, DockingTask) and engine_for(request.operation).id == "gnina"
    assert input_identifiers(request) == {
        value["receptor"]["asset_id"],
        value["ligand"]["asset_id"],
    }
    assert not needs_gpu(request)
    assert needs_gpu(request.model_copy(update={"options": DockingOptions(use_gpu=True)}))
    for mutate in [
        lambda v: v["search"].update(frame=reference()),
        lambda v: v.update(name=" "),
        lambda v: v.update(mode="score"),
        lambda v: v.update(options={"exhaustiveness": 128, "num_modes": 100}),
        lambda v: v.update(options={"cnn_scoring": "all"}),
        lambda v: v.update(options={"cpu": True}),
        lambda v: v["search"]["box"].update(center=[float("nan"), 0, 0]),
        lambda v: v["search"]["box"].update(size=[0, 20, 20]),
    ]:
        bad = task()
        mutate(bad)
        with pytest.raises(ValidationError):
            TASK_ADAPTER.validate_python(bad)
    assert "--score_only" in arguments(DockingOptions(), "score")
    assert "--no_gpu" in arguments(DockingOptions(), "dock")
    assert "--minimize" in arguments(DockingOptions(), "minimize")
    assert SearchBox(center=(1, 2, 3), size=(20, 20, 20)).unit == "angstrom"


def test_pose_scoring_requires_explicit_frame_and_rejects_search_controls():
    value = task()
    value.update(
        mode="score",
        search=None,
        pose_frame=value["receptor"],
        pose_coordinate_basis="user_confirmed",
    )
    assert DockingTask.model_validate(value).mode == "score"
    value["options"] = {"cnn_scoring": "all", "use_gpu": True}
    with pytest.raises(ValidationError, match="Score-only"):
        DockingTask.model_validate(value)


def test_independent_unavailable_runtime_and_gpu_preflight(settings, client_factory):
    with pytest.raises(ValueError, match="Install GNINA"):
        configuration(settings)
    with pytest.raises(RuntimeError):
        validate(DockingTask.model_validate(task()), {"ready": False})
    gpu = task()
    gpu["options"] = {"use_gpu": True}
    with pytest.raises(RuntimeError, match="NVIDIA"):
        validate(DockingTask.model_validate(gpu), {"ready": True})
    with client_factory() as client:
        cap = client.get("/api/capabilities/gnina.dock")
        assert cap.status_code == 200 and cap.json()["environment"] == "gnina"
        refs = {}
        for role, kind, name, content in [
            ("receptor", "structure", "protein.pdb", b"ATOM\n"),
            ("ligand", "ligand", "ligand.sdf", b"mol\n$$$$\n"),
        ]:
            asset = client.post(
                "/api/assets?kind=" + kind + "&name=" + name,
                content=content,
                headers={"Content-Type": "application/octet-stream"},
            ).json()
            refs[role] = {"asset_id": asset["id"], "sha256": asset["sha256"]}
        value = task()
        value.update(refs)
        value["search"]["frame"] = refs["receptor"]
        response = client.post("/api/jobs", json=value, headers={"Idempotency-Key": str(uuid4())})
        assert response.status_code == 503, response.text
        value["ligand"]["sha256"] = "0" * 64
        assert (
            client.post(
                "/api/jobs", json=value, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 422
        )
        assert (
            client.post("/api/jobs", json=value, headers={"X-Workbench-CSRF": "bad"}).status_code
            == 403
        )
        assert client.get("/api/jobs").json() == []


def test_output_lineage_records_and_filtered_query_are_persistent(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    scientific = ScientificStore(store, assets)
    receptor = assets.save("receptor.pdb", "structure", b"ATOM\n")
    ligand = assets.save("input.sdf", "ligand", b"molecule\n$$$$\n")
    versions = [
        scientific.create(VersionInput(asset_id=a.id, kind=k, label=a.name), uuid4())
        for a, k in [(receptor, "structure"), (ligand, "molecule")]
    ]
    value = task()
    value.update(
        receptor=versions[0].reference.model_dump(mode="json"),
        ligand=versions[1].reference.model_dump(mode="json"),
    )
    value["search"]["frame"] = value["receptor"]
    job = store.create(DockingTask.model_validate(value), str(uuid4()), 20, 100)
    file = tmp_path / "pose-001.sdf"
    file.write_text("molecule\n$$$$\n")
    catalog = OutputCatalog(store, assets)
    asset, poses = catalog.preserve(job.id, file, "ligand")
    assert catalog.preserve(job.id, file, "ligand")[1] == poses
    assert poses[0].parent_id == versions[1].id
    assert poses[0].reference.record == 0 and poses[0].reference.sha256 == asset.sha256
    persisted = ScientificStore(Store(tmp_path / "jobs.sqlite3"), assets)
    assert persisted.list(source_job=job.id) == poses
    assert persisted.list(source_job=uuid4()) == []


def test_workflow_allows_new_docking_ligand_but_not_unverified_pose_frames():
    value = {
        "name": "design then dock",
        "steps": [
            {
                "id": "design",
                "request": {"operation": "properties", "name": "source", "smiles": ["CCO"]},
            },
            {
                "id": "dock",
                "request": task(),
                "depends_on": ["design"],
                "bindings": [
                    {
                        "from_step": "design",
                        "target": "docking_ligand",
                        "kind": "ligand",
                        "artifact": "molecule.sdf",
                    }
                ],
            },
        ],
    }
    assert PlanInput.model_validate(value).steps[1].bindings[0].target == "docking_ligand"
    second = value["steps"][1]["request"]
    second.update(
        mode="score",
        search=None,
        pose_frame=second["receptor"],
        pose_coordinate_basis="user_confirmed",
    )
    with pytest.raises(ValidationError, match="existing poses"):
        PlanInput.model_validate(value)
