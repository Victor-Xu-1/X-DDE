"""Unresolved planning is explicit; real completed source bytes govern dataset handoffs."""

import copy
import hashlib
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.datasets.result import DatasetResult
from opendde_workbench.models import Status
from opendde_workbench.store import Store
from opendde_workbench.workflows.contracts import PlanInput
from opendde_workbench.workflows.data_bindings import resolve_data


def plan():
    ref = {"asset_id": str(uuid4()), "sha256": "1" * 64}
    source = {"job_id": str(uuid4()), "report_sha256": "0" * 64, "role": "definition"}
    return {
        "name": "DEL public study",
        "steps": [
            {
                "id": "definition",
                "request": {
                    "operation": "del_validate",
                    "name": "library",
                    "inputs": [{"role": "definition", "source": ref}],
                    "scientific_inputs": [ref],
                    "payload": {"kind": "deli", "mode": "validate"},
                },
            },
            {
                "id": "enumerate",
                "depends_on": ["definition"],
                "data_bindings": [{"from_step": "definition", "slot": 0, "role": "definition"}],
                "request": {
                    "operation": "del_enumerate",
                    "name": "members",
                    "sources": [source],
                    "payload": {
                        "kind": "deli",
                        "mode": "enumerate",
                        "library": "DEL006",
                        "selected_members": [["A035", "B040", "C030"]],
                    },
                },
            },
        ],
        "budget": {"max_jobs": 2},
    }


def test_dataset_plan_rejects_source_type_confusion_and_undeclared_dependency():
    value = plan()
    assert len(PlanInput.model_validate(value).steps) == 2
    for patch in (
        {"role": "index"},
        {"slot": 1},
        {"from_step": "missing"},
        {"select_candidates": True},
    ):
        broken = copy.deepcopy(value)
        broken["steps"][1]["data_bindings"][0].update(patch)
        with pytest.raises(ValueError):
            PlanInput.model_validate(broken)
    broken = copy.deepcopy(value)
    broken["steps"][1]["request"]["sources"][0]["report_sha256"] = "a" * 64
    with pytest.raises(ValueError, match="unresolved"):
        PlanInput.model_validate(broken)


def test_data_handoff_requires_success_and_exact_verified_source_bytes(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    steps = PlanInput.model_validate(plan()).steps
    task = DatasetTask.model_validate(steps[0].request)
    job = store.create(task, str(uuid4()), 10, 100)
    latest = {"definition": {"job_id": job.id}}
    settings = SimpleNamespace(state_dir=tmp_path)
    with pytest.raises(ValueError, match="completed"):
        resolve_data(steps[1], latest, store, settings, steps[1].request.model_dump(mode="json"))
    store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = tmp_path / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    content = b'{"library":"confirmed_protocol_fixture"}'
    (output / "del-definition.json").write_bytes(content)
    result = DatasetResult(
        operation=task.operation,
        program="deli",
        version="protocol-test-only",
        request_sha256=hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        data_kind="definition",
        artifacts=[
            {
                "name": "del-definition.json",
                "sha256": hashlib.sha256(content).hexdigest(),
                "size": len(content),
                "format": "json",
                "role": "del_library_definition",
            }
        ],
    )
    (output / "result.json").write_text(result.model_dump_json())
    body = resolve_data(steps[1], latest, store, settings, steps[1].request.model_dump(mode="json"))
    assert body["sources"][0]["job_id"] == job.id
    assert (
        body["sources"][0]["report_sha256"]
        == hashlib.sha256((output / "result.json").read_bytes()).hexdigest()
    )
    assert (
        json.loads((output / "del-definition.json").read_bytes())["library"]
        == "confirmed_protocol_fixture"
    )
    (output / "del-definition.json").write_bytes(content.replace(b"confirmed", b"corrupted"))
    with pytest.raises(ValueError):
        resolve_data(steps[1], latest, store, settings, steps[1].request.model_dump(mode="json"))
