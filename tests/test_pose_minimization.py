"""Focused preview contracts/security and immutable save boundaries; physics is tested remotely."""

import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.assets import AssetStore
from opendde_workbench.chemistry.minimization_result import validate_minimization
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers
from opendde_workbench.research.pose_contract import PreviewMinimizeInput
from opendde_workbench.research.pose_minimization import PoseMinimization
from opendde_workbench.store import Store


def test_minimization_is_an_exact_bounded_task_in_the_existing_engine():
    source = {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 3}
    task = TASK_ADAPTER.validate_python({"operation": "molecule_minimize", "molecule": source})
    assert engine_for(task.operation).id == "chemistry"
    assert input_identifiers(task) == {source["asset_id"]}
    assert TASK_ADAPTER.validate_json(task.model_dump_json()) == task
    for option in [
        {"max_iterations": 2001},
        {"max_iterations": True},
        {"force_field": "auto"},
        {"cpu": 0},
    ]:
        with pytest.raises(ValidationError):
            TASK_ADAPTER.validate_python(
                {"operation": "molecule_minimize", "molecule": source, "options": option}
            )
    with pytest.raises(ValidationError):
        TASK_ADAPTER.validate_python(
            {"operation": "molecule_minimize", "molecule": {**source, "conformer": 1}}
        )
    with pytest.raises(ValidationError):
        PreviewMinimizeInput.model_validate(
            {"source": {"kind": "asset", "asset_id": source["asset_id"]}, "method": "receptor"}
        )


def context(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    return store, assets, PoseMinimization(store, assets, settings)


def test_preview_resolution_keeps_exact_record_and_confirmed_receptor(settings):
    store, assets, service = context(settings)
    ligand = assets.save("input.sdf", "ligand", b"record one\n$$$$\nrecord two\n$$$$\n")
    source = {"kind": "asset", "asset_id": ligand.id, "record": 1}
    value = PreviewMinimizeInput.model_validate({"source": source})
    task = service.task(value)
    assert task.molecule.record == 1 and task.molecule.version_id
    assert service.task(value) == task
    assert input_identifiers(task) == {ligand.id}
    receptor = assets.save("receptor.pdb", "structure", b"ATOM receptor\nEND\n")
    bound = service.task(
        PreviewMinimizeInput.model_validate(
            {
                "source": source,
                "method": "receptor",
                "receptor": {"kind": "asset", "asset_id": receptor.id},
                "coordinate_basis": "user_confirmed",
                "max_iterations": 300,
            }
        )
    )
    assert bound.mode == "minimize" and bound.search is None
    assert bound.pose_frame == bound.receptor and bound.pose_coordinate_basis == "user_confirmed"
    assert bound.options.minimize_iters == 300 and not bound.options.use_gpu
    with pytest.raises(ValueError, match="existing record"):
        service.task(PreviewMinimizeInput.model_validate({"source": {**source, "record": 2}}))
    with pytest.raises(ValueError, match="chemical bonds"):
        service.task(
            PreviewMinimizeInput.model_validate(
                {"source": {"kind": "asset", "asset_id": receptor.id}}
            )
        )
    assets.path(ligand).write_bytes(b"changed")
    with pytest.raises(ValueError):
        service.task(value)


def result_fixture(task, output):
    # A transport fixture deliberately contains no claimed native chemistry.
    content = b"bounded contract fixture\n$$$$\n"
    (output / "minimized.sdf").write_bytes(content)
    return {
        "operation": "molecule_minimize",
        "complete": True,
        "schema_version": 1,
        "source": task.molecule.model_dump(mode="json"),
        "options": task.options.model_dump(),
        "method": "MMFF94s",
        "geometry_frame": "unbound_pose",
        "energy_before": 20.0,
        "energy_after": 10.0,
        "energy_unit": "kcal/mol",
        "energy_basis": "hydrogen_completed_same_state",
        "converged": True,
        "artifact": "minimized.sdf",
        "artifact_sha256": hashlib.sha256(content).hexdigest(),
        "source_atom_count": 2,
        "output_atom_count": 2,
        "source_to_pose_atoms": [0, 1],
        "identity_smiles": "CC",
        "identity_preserved": True,
        "coordinate_stereo_preserved": True,
        "software_version": "2023.09.6",
    }


def test_pose_saves_automatically_as_an_idempotent_child_and_rejects_tampering(settings):
    from opendde_workbench.research.outputs import OutputCatalog

    store, assets, service = context(settings)
    ligand = assets.save("original.sdf", "ligand", b"original\n$$$$\n")
    original = assets.path(ligand).read_bytes()
    task = service.task(
        PreviewMinimizeInput.model_validate({"source": {"kind": "asset", "asset_id": ligand.id}})
    )
    job = store.create(task, str(uuid4()), 20, 100)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    report = result_fixture(task, output)
    (output / "result.json").write_text(json.dumps(report))
    # Worker indexes before marking success; it uses this same production OutputCatalog.
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    saved = service.save(job.id)
    assert saved == service.save(job.id)
    assert saved["pose"]["parent_id"] == str(task.molecule.version_id)
    assert saved["pose"]["relation"] == "edited_from"
    assert saved["pose"]["validation"] == "native_edited"
    assert assets.path(ligand).read_bytes() == original
    for mutation in (
        {"energy_after": 21.0},
        {"energy_before": float("nan")},
        {"source_to_pose_atoms": [1, 0]},
        {"identity_preserved": False},
    ):
        with pytest.raises(ValueError):
            validate_minimization({**report, **mutation}, task, output)
    (output / "minimized.sdf").write_bytes(b"tampered\n$$$$\n")
    with pytest.raises(ValueError, match="changed"):
        service.save(job.id)


def test_preview_api_requires_csrf_and_rejects_unowned_paths(client_factory):
    with client_factory() as client:
        body = {"source": {"kind": "artifact", "job_id": str(uuid4()), "name": "../../outside.sdf"}}
        key = str(uuid4())
        client.headers.pop("X-Workbench-CSRF")
        assert (
            client.post(
                "/api/research/poses/minimize", json=body, headers={"Idempotency-Key": key}
            ).status_code
            == 403
        )
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert (
            client.post(
                "/api/research/poses/minimize", json=body, headers={"Idempotency-Key": key}
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/research/poses/minimize",
                json={"source": {"url": "http://evil/input.sdf"}},
                headers={"Idempotency-Key": key},
            ).status_code
            == 422
        )
        assert client.post(f"/api/research/poses/{uuid4()}/save", json={}).status_code == 422


def test_preview_never_silently_drops_existing_molecular_constraints(settings, monkeypatch):
    from types import SimpleNamespace

    _, _, service = context(settings)
    source_job = SimpleNamespace(status=Status.SUCCEEDED, request=SimpleNamespace(constraints=True))
    monkeypatch.setattr(service.store, "get", lambda _: source_job)
    value = PreviewMinimizeInput.model_validate(
        {
            "source": {
                "kind": "artifact",
                "job_id": str(uuid4()),
                "name": "pose-001.sdf",
            }
        }
    )
    with pytest.raises(ValueError, match="molecular constraints"):
        service.task(value)
    with pytest.raises(ValueError, match="molecular constraints"):
        service.sources.check_constraints(SimpleNamespace(source_job=str(uuid4())))
