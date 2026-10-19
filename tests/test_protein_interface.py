"""Exact request lineage, complete report classes and historical compatibility."""

import hashlib
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.result import validate_result
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.scientific_objects import MoleculeRef
from opendde_workbench.task_history.kinds import classify_request


def request(count=1):
    inputs = [
        {
            "role": "structure",
            "source": {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0},
        }
        for _ in range(count)
    ]
    return {
        "operation": "protein_interface",
        "name": "Protein interface comparison",
        "inputs": inputs,
        "scientific_inputs": [i["source"] for i in inputs],
        "payload": {
            "kind": "plip",
            "scope": "protein_interface",
            "target_chains": ["A"],
            "binder_chains": ["B"],
            "candidate_names": [f"Complex {i}" for i in range(count)],
        },
    }


@pytest.mark.parametrize("count", [1, 2, 3])
def test_batch_is_dispatched_by_the_existing_engine_and_classified_with_legacy_history(count):
    task = TASK_ADAPTER.validate_python(request(count))
    assert isinstance(task, IntegratedTask) and task.payload.kind == "plip"
    assert classify_request(task.model_dump(mode="json")) == "structure"
    assert classify_request({"operation": "harness", "tool": "structure"}) == "structure"
    assert task.scientific_inputs == [i.source for i in task.inputs]


@pytest.mark.parametrize(
    "change",
    [
        "overlap",
        "duplicate_chain",
        "bad_chain",
        "missing_name",
        "extra_name",
        "repeated_source",
        "wrong_scope",
        "wrong_operation",
        "conformer",
        "record",
        "missing_lineage",
        "four_complexes",
    ],
)
def test_invalid_or_ambiguous_interfaces_fail_before_execution(change):
    value = request(2)
    payload = value["payload"]
    if change == "overlap":
        payload["binder_chains"] = ["A"]
    if change == "duplicate_chain":
        payload["binder_chains"] = ["B", "B"]
    if change == "bad_chain":
        payload["target_chains"] = ["AB"]
    if change == "missing_name":
        payload["candidate_names"][0] = " "
    if change == "extra_name":
        payload["candidate_names"].append("Extra")
    if change == "repeated_source":
        value["inputs"][1]["source"] = value["inputs"][0]["source"]
    if change == "wrong_scope":
        payload.pop("scope")
        value["operation"] = "interaction_profile"
    if change == "wrong_operation":
        value["operation"] = "interaction_profile"
    if change == "conformer":
        value["inputs"][0]["source"]["conformer"] = 1
    if change == "record":
        value["inputs"][0]["source"]["record"] = 1
    if change == "missing_lineage":
        value["scientific_inputs"] = []
    if change == "four_complexes":
        value = request(4)
    with pytest.raises(ValidationError):
        TASK_ADAPTER.validate_python(value)


def complete_result(tmp_path):
    source = b"original coordinates and residue identities"
    value = request()
    value["inputs"][0]["source"]["sha256"] = hashlib.sha256(source).hexdigest()
    task = TASK_ADAPTER.validate_python(value)
    files = {
        "complex.cif": source,
        "report.txt": b"PLIP native report",
        "contacts.csv": b"Type\nwater_bridge\n",
        "report.xml": (
            b"<report><plipversion>3.0.1</plipversion><bindingsite><interactions>"
            b"<water_bridges><water_bridge/></water_bridges>"
            b"</interactions></bindingsite></report>"
        ),
    }
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
    result = {
        "operation": "protein_interface",
        "program": "plip",
        "version": "3.0.1",
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "artifact_sha256": {n: hashlib.sha256(b).hexdigest() for n, b in files.items()},
        "protein_interfaces": [
            {
                "name": task.payload.candidate_names[0],
                "source": task.inputs[0].source.model_dump(mode="json"),
                "structure_artifact": "complex.cif",
                "xml_artifact": "report.xml",
                "text_artifact": "report.txt",
                "table_artifact": "contacts.csv",
                "polymer_residues": 883,
                "interactions": [
                    {
                        "kind": "water_bridge",
                        "chain": "A",
                        "number": 641,
                        "residue": "PTR",
                        "insertion_code": "",
                        "partner": {
                            "chain": "B",
                            "number": 604,
                            "residue": "ARG",
                            "insertion_code": "",
                        },
                        "protein_position": [0, 0, 0],
                        "ligand_position": [3, 0, 0],
                        "bridge_position": [1, 1, 0],
                        "distance": 3,
                    }
                ],
            }
        ],
    }
    return task, result


def test_complete_reports_keep_water_bridges_and_exact_source_bytes(tmp_path):
    task, result = complete_result(tmp_path)
    assert (
        validate_result(result, task, tmp_path).protein_interfaces[0].interactions[0].residue
        == "PTR"
    )


@pytest.mark.parametrize(
    "change",
    [
        "truncated",
        "wrong_file",
        "missing_csv",
        "wrong_source",
        "wrong_chain",
        "wrong_partner",
        "wrong_distance",
        "wrong_version",
    ],
)
def test_incomplete_or_mixed_native_result_cannot_be_accepted(tmp_path, change):
    task, result = complete_result(tmp_path)
    candidate = result["protein_interfaces"][0]
    row = candidate["interactions"][0]
    if change == "truncated":
        candidate["interactions"] = []
    if change == "wrong_file":
        result["artifact_sha256"]["complex.cif"] = "b" * 64
    if change == "missing_csv":
        result["artifact_sha256"].pop("contacts.csv")
    if change == "wrong_source":
        candidate["source"]["asset_id"] = str(uuid4())
    if change == "wrong_chain":
        row["chain"] = "C"
    if change == "wrong_partner":
        row["partner"]["chain"] = "A"
    if change == "wrong_distance":
        row["distance"] = 2
    if change == "wrong_version":
        result["version"] = "2.4.0"
    with pytest.raises(ValueError):
        validate_result(deepcopy(result), task, tmp_path)


def test_original_ligand_only_request_keeps_its_payload_and_dispatch():
    value = request()
    value["operation"] = "interaction_profile"
    value["payload"] = {"kind": "plip", "ligand_chain": "A", "ligand_number": 701}
    task = TASK_ADAPTER.validate_python(value)
    assert task.payload.model_dump() == value["payload"]
    assert "scope" not in task.model_dump_json()


def test_stat6_interface_template_uses_the_deposited_phosphorylated_dimer():
    from opendde_workbench.examples.stat6.integrated_requests import integrated_study

    source = MoleculeRef.model_validate(request()["inputs"][0]["source"])
    value = integrated_study(
        "structure", {"stat6_alternative": SimpleNamespace(reference=source)}, {}
    )
    task = TASK_ADAPTER.validate_python(value)
    assert task.operation == "protein_interface"
    assert task.payload.target_chains == ["A"] and task.payload.binder_chains == ["B"]
    assert task.payload.candidate_names == ["STAT6 4Y5U phosphorylated A/B dimer"]
    assert task.inputs[0].source == source and task.scientific_inputs == [source]
