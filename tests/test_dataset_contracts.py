"""Exact versions, scientific roles, sample controls and large-output budgets fail closed."""

import hashlib
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.datasets.del_options import DELOptions
from opendde_workbench.datasets.integrity import verified
from opendde_workbench.datasets.result import validate_result
from opendde_workbench.datasets.suppliers import catalogue
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64}


def source(role):
    return {"job_id": str(uuid4()), "report_sha256": "b" * 64, "role": role}


def test_large_library_inputs_keep_exact_versions_and_native_engine_identity():
    ref = reference()
    value = DatasetTask(
        operation="library_prepare",
        name="Supplier library",
        inputs=[{"role": "data", "source": ref}],
        scientific_inputs=[ref],
        payload={"kind": "chemistry"},
    )
    assert TASK_ADAPTER.validate_json(value.model_dump_json()) == value
    assert input_identifiers(value) == {ref["asset_id"]}
    assert engine_for(value.operation).id == "chemistry"
    assert value.output_bytes == 50 * 1024**3
    for patch in (
        {"scientific_inputs": []},
        {"constraints": {"id": str(uuid4()), "sha256": "b" * 64}},
        {"options": {"device": "cuda"}},
        {"output_bytes": 500 * 1024**3},
    ):
        with pytest.raises(ValidationError):
            DatasetTask.model_validate({**value.model_dump(), **patch})


def test_retrieval_requires_compatible_stages_exact_pocket_frame_and_noncommercial_use():
    receptor = reference()
    request = {
        "operation": "drugclip_retrieve",
        "name": "BRD4 pocket retrieval",
        "sources": [source("index")],
        "inputs": [{"role": "structure", "source": receptor}],
        "scientific_inputs": [receptor],
        "payload": {
            "kind": "drugclip",
            "mode": "retrieve",
            "use": "non_commercial",
            "receptor": receptor,
            "search": {
                "kind": "box",
                "frame": receptor,
                "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
            },
        },
    }
    assert engine_for(DatasetTask.model_validate(request).operation).id == "drugclip"
    for patch in (
        {"use": "commercial"},
        {"retain": 101},
        {"precision": "float16"},
        {
            "search": {
                "kind": "box",
                "frame": reference(),
                "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
            }
        },
    ):
        with pytest.raises(ValidationError):
            DatasetTask.model_validate({**request, "payload": {**request["payload"], **patch}})
    with pytest.raises(ValidationError, match="indexes"):
        DatasetTask.model_validate({**request, "sources": [source("library")]})
    with pytest.raises(ValidationError, match="roles"):
        DatasetTask.model_validate({**request, "inputs": [{"role": "data", "source": receptor}]})


def test_del_design_never_pools_different_reference_types_or_unmatched_batches():
    design = {
        "mode": "analyze",
        "samples": [
            {"column": "selection1", "group": "target", "role": "target", "replicate": 1},
            {"column": "selection2", "group": "target", "role": "target", "replicate": 2},
            {"column": "blank", "group": "blank", "role": "ntc"},
        ],
        "comparisons": [{"id": "vs_blank", "selection": "target", "reference": "blank"}],
    }
    assert len(DELOptions(**design).samples) == 3
    changed = [
        {**row, "batch": "other"} if row["group"] == "blank" else row for row in design["samples"]
    ]
    with pytest.raises(ValidationError, match="batches"):
        DELOptions(**{**design, "samples": changed})
    with pytest.raises(ValidationError, match="separate"):
        DELOptions(
            **{
                **design,
                "samples": [
                    *design["samples"],
                    {"column": "input", "group": "blank", "role": "input", "replicate": 2},
                ],
            }
        )
    with pytest.raises(ValidationError, match="replicate"):
        DELOptions(
            **{
                **design,
                "samples": [
                    *design["samples"],
                    {"column": "selection3", "group": "target", "role": "target", "replicate": 1},
                ],
            }
        )
    assert not DELOptions(mode="analyze", samples=[design["samples"][0]]).comparisons


def test_each_del_path_has_one_actual_native_contract_and_completed_source_roles():
    ref = reference()
    cases = {
        "validate": ([{"role": "definition", "source": ref}], [], {}),
        "enumerate": ([], [source("definition")], {"selected_members": [["A035", "B040", "C030"]]}),
        "decode": (
            [{"role": "reads", "source": ref, "label": "BRD4"}],
            [source("definition")],
            {"read_samples": [{"input_label": "BRD4", "sample": "BRD4"}]},
        ),
        "count": ([], [source("decoded")], {}),
        "analyze": (
            [{"role": "counts", "source": ref}],
            [],
            {"samples": [{"column": "target", "group": "target", "role": "target"}]},
        ),
        "series": ([], [source("analysis")], {"chosen_comparison": "vs_blank"}),
        "model": ([], [source("analysis")], {"chosen_comparison": "vs_blank"}),
        "candidates": ([], [source("analysis")], {"selected_ids": ["DEL006-A035-B040-C030"]}),
        "followup": ([{"role": "counts", "source": ref}], [source("analysis")], {}),
    }
    for mode, (inputs, sources, options) in cases.items():
        task = DatasetTask(
            operation="del_" + mode,
            name="UNCDEL006 " + mode,
            inputs=inputs,
            sources=sources,
            scientific_inputs=[row["source"] for row in inputs],
            payload={"kind": "deli", "mode": mode, **options},
        )
        assert TASK_ADAPTER.validate_json(task.model_dump_json()) == task
        assert engine_for(task.operation).id == "deli"
        with pytest.raises(ValidationError):
            DatasetTask.model_validate({**task.model_dump(), "sources": [source("index")]})


def test_integrity_cache_rejects_same_size_changed_bytes_and_result_row_accounting(tmp_path):
    file = tmp_path / "library.sqlite"
    file.write_bytes(b"verified original")
    expected = hashlib.sha256(file.read_bytes()).hexdigest()
    assert verified(file, expected)
    assert verified(file, expected)
    file.write_bytes(b"changed artifact!")
    with pytest.raises(ValueError, match="integrity"):
        verified(file, expected)
    ref = reference()
    task = DatasetTask(
        operation="library_prepare",
        name="Library accounting",
        inputs=[{"role": "data", "source": ref}],
        scientific_inputs=[ref],
        payload={"kind": "chemistry"},
    )
    summary = {
        "operation": task.operation,
        "program": "chemistry",
        "version": "native",
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "data_kind": "library",
        "artifacts": [
            {
                "name": file.name,
                "format": "sqlite",
                "role": "compound_library",
                "size": file.stat().st_size,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            }
        ],
        "counts": {
            "source_records": 12,
            "valid_records": 10,
            "rejected_records": 2,
            "unique_compounds": 9,
            "duplicate_chemical_records": 1,
        },
    }
    assert validate_result(summary, task, tmp_path).counts["unique_compounds"] == 9
    with pytest.raises(ValueError, match="accounting"):
        validate_result(
            {**summary, "counts": {**summary["counts"], "source_records": 13}}, task, tmp_path
        )
    with pytest.raises(ValueError, match="role"):
        validate_result({**summary, "data_kind": "index"}, task, tmp_path)


def test_all_35_supplier_connections_are_import_paths_without_invented_stock_or_private_apis():
    entries = catalogue()
    assert len(entries) == len({row["id"] for row in entries}) == 35
    assert {row["id"] for row in entries} >= {"mce", "chemdiv", "enamine", "targetmol", "vitas-m"}
    assert all(row["connection"] == "official_download_or_owned_file" for row in entries)
    assert "api.drugclip" not in json.dumps(entries)
