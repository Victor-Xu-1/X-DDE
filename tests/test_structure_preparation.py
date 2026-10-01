"""Exact source binding, bounded selection and preparation artifact integrity."""

import copy
import hashlib
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.receptors.preparation_contract import StructurePrepareTask
from opendde_workbench.receptors.preparation_options import PreparationOptions
from opendde_workbench.receptors.preparation_result import validate_preparation
from opendde_workbench.requests import TASK_ADAPTER


def task():
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}
    return StructurePrepareTask(structure=ref, scientific_inputs=[ref])


def test_preparation_source_constraints_selection_and_discriminator():
    value = task()
    assert TASK_ADAPTER.validate_python(value.model_dump()).operation == "structure_prepare"
    with pytest.raises(ValidationError, match="exact selected"):
        StructurePrepareTask(structure=value.structure)
    for patch in (
        {"chains": ["A", "A"]},
        {"model_index": 100},
        {"alternate": "auto"},
        {"chains": ["A\x00"]},
    ):
        with pytest.raises(ValidationError):
            PreparationOptions(**patch)


def test_preparation_result_digest_and_claims_fail_closed(tmp_path):
    selected = task()
    raw = b"ATOM coordinates\n"
    file = tmp_path / "prepared.pdb"
    file.write_bytes(raw)
    value = {
        "operation": "structure_prepare",
        "complete": True,
        "schema_version": 1,
        "source": selected.structure.model_dump(mode="json"),
        "options": selected.options.model_dump(mode="json"),
        "artifact": "prepared.pdb",
        "sha256": hashlib.sha256(raw).hexdigest(),
        "inspection": {
            "model_count": 1,
            "selected_chains": ["A"],
            "parser_warnings": [],
            "parser_warnings_truncated": False,
        },
        "atom_count": 3,
        "removed_residues": [],
        "resolved_alternates": [],
        "versions": {"biopython": "1.86"},
        "coordinate_frame": "source_coordinates_selected_model",
        "coordinate_unit": "angstrom",
        "scope": "observed_selection_and_format_export_not_chemical_preparation",
        "unobserved_atoms": "not_generated",
        "biological_assembly": "provided_coordinates_only",
    }
    assert validate_preparation(value, selected, tmp_path).atom_count == 3
    changed = copy.deepcopy(value)
    changed["options"]["waters"] = True
    with pytest.raises(ValueError, match="differ"):
        validate_preparation(changed, selected, tmp_path)
    changed = copy.deepcopy(value)
    changed["biological_assembly"] = "generated"
    with pytest.raises(ValidationError):
        validate_preparation(changed, selected, tmp_path)
    file.write_bytes(b"changed")
    with pytest.raises(ValueError, match="bytes changed"):
        validate_preparation(value, selected, tmp_path)
