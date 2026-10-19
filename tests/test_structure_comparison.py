"""Comparison admission cannot silently change roles, snapshots or matched observations."""

import pytest
from pydantic import ValidationError

from opendde_workbench.scientific_objects import MoleculeRef
from opendde_workbench.structure_comparison.contract import StructureComparisonTask
from opendde_workbench.structure_comparison.native_matching import mapped_pairs
from opendde_workbench.structure_comparison.options import ComparisonOptions


def options(**changes):
    return ComparisonOptions.model_validate(
        {
            "target_mapping": [{"reference": "A", "moving": "X"}],
            "partner_mapping": [{"reference": "B", "moving": "Y"}],
            "minimum_target_pairs": 3,
            **changes,
        }
    )


def observed(letters, chain, numbers=None):
    return [
        (letter, None, {"chain": chain, "number": number, "insertion_code": insertion})
        for letter, (number, insertion) in zip(
            letters, numbers or [(i + 1, "") for i in range(len(letters))], strict=True
        )
    ]


def test_comparison_requires_distinct_one_to_one_roles():
    with pytest.raises(ValidationError, match="one-to-one"):
        options(partner_mapping=[{"reference": "A", "moving": "Y"}])
    with pytest.raises(ValidationError, match="one-to-one"):
        options(partner_mapping=[{"reference": "B", "moving": "X"}])
    with pytest.raises(ValidationError):
        options(target_mapping=[])
    with pytest.raises(ValidationError):
        options(cpu="1")


def test_insertion_codes_and_explicit_different_chain_names_survive_correspondence():
    left = observed("CAG", "A", [(10, ""), (10, "A"), (11, "")])
    right = observed("AGC", "X", [(10, "A"), (11, ""), (10, "")])
    selected = options(correspondence="author_numbering")
    pairs, evidence = mapped_pairs(
        {"A": left}, {"X": right}, selected.target_mapping, selected, "target"
    )
    assert len(pairs) == 3
    assert [pair[1][2] for pair in pairs] == [right[i][2] for i in (2, 0, 1)]
    assert evidence[0]["reference_coverage"] == evidence[0]["moving_coverage"] == 1


def test_evaluated_mutations_are_not_discarded_to_make_rmsd_look_better():
    selected = options(minimum_identity=0.5)
    pairs, evidence = mapped_pairs(
        {"A": observed("ACD", "A")},
        {"X": observed("AED", "X")},
        selected.target_mapping,
        selected,
        "target",
    )
    assert len(pairs) == 3 and pairs[1][0][0] != pairs[1][1][0]
    assert evidence[0]["matched"] == 3 and evidence[0]["identical"] == 2


def test_ambiguous_sequence_and_insufficient_observed_coverage_are_rejected():
    selected = options()
    with pytest.raises(ValueError, match="ambiguous"):
        mapped_pairs(
            {"A": observed("AAAA", "A")},
            {"X": observed("AAA", "X")},
            selected.target_mapping,
            selected,
            "target",
        )
    selected = options(correspondence="author_numbering", minimum_coverage=0.9)
    with pytest.raises(ValueError, match="coverage"):
        mapped_pairs(
            {"A": observed("ACDE", "A")},
            {"X": observed("ACD", "X")},
            selected.target_mapping,
            selected,
            "target",
        )


def test_source_versions_and_structural_model_semantics_are_exact():
    reference = MoleculeRef(asset_id="11111111-1111-4111-8111-111111111111", sha256="a" * 64)
    moving = MoleculeRef(asset_id="22222222-2222-4222-8222-222222222222", sha256="b" * 64)
    request = {
        "reference": reference,
        "moving": moving,
        "options": options(),
        "scientific_inputs": [reference, moving],
    }
    assert StructureComparisonTask(**request).operation == "structure_compare"
    with pytest.raises(ValidationError, match="both exact"):
        StructureComparisonTask(**{**request, "scientific_inputs": [moving, reference]})
    changed = moving.model_copy(update={"record": 1})
    with pytest.raises(ValidationError, match="model indices"):
        StructureComparisonTask(
            **{**request, "moving": changed, "scientific_inputs": [reference, changed]}
        )
