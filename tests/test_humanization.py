"""Deterministic source-preservation rules; real models have a separate target-server gate."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.humanization.contract import HumanizationTask
from opendde_workbench.humanization.options import HumanizationOptions
from opendde_workbench.humanization.proposals import AMINO_ACIDS, propose, validate_scores


def matrix(sequence):
    return [{amino_acid: 0.01 for amino_acid in AMINO_ACIDS} for _ in sequence]


def positions(sequence):
    return [
        {
            "source_position": index + 1,
            "amino_acid": amino_acid,
            "number": index + 1,
            "insertion": "",
            "region": "framework",
        }
        for index, amino_acid in enumerate(sequence)
    ]


def test_exact_fasta_source_and_actual_mode_parameters():
    ref = {
        "asset_id": str(uuid4()),
        "sha256": "a" * 64,
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }
    task = HumanizationTask(sequences=ref, scientific_inputs=[ref])
    assert task.options.mode == "evaluate" and task.options.max_mutations == 0
    for change in (
        {"scientific_inputs": []},
        {"sequences": {**ref, "record": 1}},
        {"options": {"mode": "framework"}},
        {"options": {"mode": "evaluate", "iterations": 2}},
        {"options": {"mode": "framework", "max_mutations": 10, "format": "vhh_exploratory"}},
        {"options": {"cpu": True}},
        {"options": {"checkpoint_path": "/unreviewed/model"}},
    ):
        with pytest.raises(ValidationError):
            HumanizationTask.model_validate({**task.model_dump(), **change})
    assert HumanizationOptions(mode="framework", max_mutations=10).iterations == 1


def test_framework_budget_preserves_cdr_and_existing_cysteines_without_introducing_new_cysteines():
    sequence = "ACDEFG"
    numbering, values = positions(sequence), matrix(sequence)
    numbering[2]["region"] = "CDR1"
    for row in values:
        row["C"] = 0.5
        row["Y"] = 0.2
    proposal, changes = propose(sequence, sequence, values, numbering, 2)
    assert proposal == "YCDYFG"
    assert [row["source_position"] for row in changes] == [1, 4]
    assert proposal.count("C") == sequence.count("C") and proposal[2] == sequence[2]
    assert len(changes) == 2


def test_repeated_iteration_budget_is_total_changes_from_original_and_addresses_must_match():
    sequence = "ADEFG"
    numbering, values = positions(sequence), matrix(sequence)
    values[1]["Y"] = 0.7
    current = "YDEFG"
    proposal, changes = propose(sequence, current, values, numbering, 1)
    assert proposal == "AYEFG" and len(changes) == 1
    numbering[0]["source_position"] = 5
    with pytest.raises(ValueError, match="original source"):
        propose(sequence, current, values, numbering, 1)


def test_invalid_native_vectors_never_become_sequence_or_reliability_predictions():
    for score in (float("nan"), float("inf"), True, -1, 2):
        values = matrix("AD")
        values[0]["A"] = score
        with pytest.raises(ValueError):
            validate_scores(values, "AD")
    values = matrix("AD")
    values[0].pop("Y")
    with pytest.raises(ValueError, match="coverage"):
        validate_scores(values, "AD")
    with pytest.raises(ValueError, match="coverage"):
        validate_scores(matrix("A"), "AD")


def test_numbering_for_evaluation_does_not_export_unchanged_domain_copies(tmp_path):
    from opendde_workbench.antibodies.native_numbering import normalize_domain

    native = {
        "query_start": 0,
        "query_end": 1,
        "score": 1.0,
        "scheme": "imgt",
        "chain_type": "H",
        "numbering": [((1, ""), "A"), ((2, ""), "C")],
    }
    record = {"id": "exact", "sequence": "AC"}
    result = normalize_domain(native, record, "exact", 0, tmp_path, preserve=False)
    assert result["available"] and result["sequence"] == "AC" and not list(tmp_path.iterdir())
    result = normalize_domain(native, record, "exact", 0, tmp_path)
    assert (tmp_path / result["artifact"]).read_bytes() == b">exact\nAC\n"


def test_native_probabilities_are_not_renormalized_or_replaced_by_clinical_scores():
    values = matrix("AC")
    validate_scores(values, "AC")
    assert sum(values[0].values()) == pytest.approx(0.2)
    invalid = matrix("AC")
    invalid[0] = dict.fromkeys(AMINO_ACIDS, 0.1)
    with pytest.raises(ValueError, match="coverage"):
        validate_scores(invalid, "AC")
