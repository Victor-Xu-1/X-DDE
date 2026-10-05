"""Focused contracts for native tasks, file integrity and persisted property-model reuse."""

import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.native_resources import model_files
from opendde_workbench.integrations.result import validate_result
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest
from opendde_workbench.requests import TASK_ADAPTER


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}


def task(operation="electrostatics", kind="apbs", payload=None):
    ref = reference()
    return {
        "operation": operation,
        "name": "BRD4 structure analysis",
        "inputs": [{"role": "structure", "source": ref}],
        "scientific_inputs": [ref],
        "payload": {"kind": kind, **(payload or {})},
    }


def test_all_nine_operations_use_the_existing_task_envelope():
    value = task()
    request = TASK_ADAPTER.validate_python(value)
    assert isinstance(request, IntegratedTask)
    assert request.scientific_inputs == [request.inputs[0].source]
    value["scientific_inputs"] = []
    with pytest.raises(ValidationError, match="exact scientific"):
        TASK_ADAPTER.validate_python(value)


def test_native_payloads_reject_wrong_device_unbounded_values_and_missing_scaffolds():
    value = task()
    value["options"] = {"device": "cuda"}
    with pytest.raises(ValidationError, match="CPU"):
        IntegratedTask.model_validate(value)
    value = task(payload={"salt_molar": float("nan")})
    with pytest.raises(ValidationError):
        IntegratedTask.model_validate(value)
    value = task("boltzgen_design", "boltzgen", {"target_chains": ["A"], "modality": "nanobody"})
    value["options"] = {"device": "cuda"}
    with pytest.raises(ValidationError, match="scaffold"):
        IntegratedTask.model_validate(value)


def test_empty_or_redirected_model_manifests_cannot_be_ready(tmp_path):
    spec = PROGRAMS["ligandmpnn"]
    manifest = {"recipe_sha256": recipe_digest("ligandmpnn"), "files": []}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="resources"):
        model_files(tmp_path, spec)
    manifest["files"] = [{"name": "../model.pt", "size": 10, "sha256": "a" * 64}]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="required"):
        model_files(tmp_path, spec)


def test_native_result_requires_request_identity_and_unchanged_scientific_bytes(tmp_path):
    request = IntegratedTask.model_validate(task())
    names = ["potential.dx", "structure.pdb"]
    for name in names:
        (tmp_path / name).write_text("native evidence")
    result = {
        "operation": "electrostatics",
        "complete": True,
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
        "program": "apbs",
        "version": "APBS 3.4.1 / PDB2PQR 3.7.1",
        "artifact_sha256": {
            name: hashlib.sha256((tmp_path / name).read_bytes()).hexdigest() for name in names
        },
        "potential_artifact": names[0],
        "structure_artifact": names[1],
        "potential_unit": "kBT/e",
    }
    assert validate_result(result, request, tmp_path).potential_unit == "kBT/e"
    (tmp_path / names[0]).write_text("changed")
    with pytest.raises(ValueError, match="bytes changed"):
        validate_result(result, request, tmp_path)
    result["request_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="snapshot"):
        validate_result(result, request, tmp_path)
