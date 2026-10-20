"""Exact native coordinate frames and roles, through the single scientific output store."""

import hashlib
import json
from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from quality_workflow_case import quality_task
from test_docking_scoring import result_body

from opendde_workbench.assets import AssetStore
from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.result import DockingResult
from opendde_workbench.models import Status
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.store import Store
from opendde_workbench.workflows.bindings import resolve
from opendde_workbench.workflows.contracts import PlanInput


def docking_case():
    value = result_body()
    value["receptor"]["sha256"] = hashlib.sha256(b"controlled receptor\n").hexdigest()
    result = DockingResult.model_validate(value)
    task = DockingTask(
        name="Controlled scoring fixture",
        mode="score",
        receptor=result.receptor,
        ligand=result.ligand,
        pose_frame=result.receptor,
        pose_coordinate_basis="user_confirmed",
        options=result.options,
    )
    return task, result.model_dump(mode="json")


def plan_body(task):
    return {
        "name": "Paired output fixture",
        "steps": [
            {"id": "dock", "request": task.model_dump(mode="json")},
            {
                "id": "quality",
                "request": quality_task().model_dump(mode="json"),
                "depends_on": ["dock"],
                "bindings": [
                    {
                        "from_step": "dock",
                        "target": "quality_molecule",
                        "kind": "ligand",
                        "result_field": "pose_artifact",
                    },
                    {
                        "from_step": "dock",
                        "target": "quality_protein",
                        "kind": "structure",
                        "result_field": "receptor_artifact",
                    },
                ],
            },
        ],
    }


def test_exact_paired_outputs_resolve_into_new_versions_not_old_template_inputs(settings):
    settings.state_dir.mkdir(parents=True)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    outputs = OutputCatalog(store, assets)
    task, value = docking_case()
    job = store.create(task, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "receptor.pdb").write_bytes(b"controlled receptor\n")
    (output / "poses.sdf").write_bytes(b"controlled pose\n$$$$\n")
    (output / "result.json").write_text(json.dumps(value), encoding="utf-8")
    store.finish(job.id, Status.SUCCEEDED)
    step = PlanInput.model_validate(plan_body(task)).steps[1]
    request = resolve(step, {"dock": {"job_id": job.id}}, store, outputs, settings)
    assert request.molecule != step.request.molecule and request.protein != step.request.protein
    assert request.scientific_inputs == [request.molecule, request.protein]
    for ref in request.scientific_inputs:
        assert str(outputs.scientific.get(ref.version_id).source_job) == job.id
    (output / "receptor.pdb").write_bytes(b"wrong frame")
    with pytest.raises(ValueError, match="coordinate frame"):
        resolve(step, {"dock": {"job_id": job.id}}, store, outputs, settings)


@pytest.mark.parametrize(
    "mutation", ["missing_pair", "wrong_kind", "arbitrary_file", "wrong_role", "wrong_profile"]
)
def test_binding_plan_rejects_unpaired_or_wrong_coordinate_sources(mutation):
    task, _ = docking_case()
    body = deepcopy(plan_body(task))
    quality = body["steps"][1]
    if mutation == "missing_pair":
        quality["bindings"].pop()
    elif mutation == "wrong_kind":
        quality["bindings"][1]["kind"] = "ligand"
    elif mutation == "arbitrary_file":
        quality["bindings"][0].pop("result_field")
        quality["bindings"][0]["artifact"] = "diagnostic.sdf"
    elif mutation == "wrong_role":
        quality["bindings"][1]["result_field"] = "pose_artifact"
    else:
        quality["request"]["options"]["profile"] = "mol"
    with pytest.raises(ValidationError):
        PlanInput.model_validate(body)
