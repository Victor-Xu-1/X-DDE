"""Native header interpretation and mutation-mask guards, not scientific inference."""

import pytest

from opendde_workbench.integrations.ligandmpnn_review import review_sequences

RESIDUES = [
    {"identity": "A566", "amino_acid": "S", "minimum_ligand_distance_A": 2.57},
    {"identity": "A588", "amino_acid": "N", "minimum_ligand_distance_A": 3.18},
    {"identity": "A590", "amino_acid": "Q", "minimum_ligand_distance_A": 2.82},
]
SELECTED = [row["identity"] for row in RESIDUES]


def test_sequence_review_helper_is_staged_in_the_actual_managed_adapter(settings):
    from opendde_workbench.integrations.backend import ScientificBackend

    backend = ScientificBackend(settings, "ligandmpnn")
    assert "ligandmpnn_review.py" in backend.files
    assert backend.shared_sources["ligandmpnn_review.py"].is_file()


def native_header(index, *, ligand="0.2"):
    return (
        f"structure, id={index}, overall_confidence=0.25, "
        f"ligand_confidence={ligand}, seq_rec=0.6667"
    )


def records(ligand_count=3):
    return [
        (
            f"structure, num_res=3, num_ligand_res={ligand_count}, "
            "use_ligand_context=True, ligand_cutoff_distance=8.0",
            "SNQ",
        ),
        (native_header(1), "TNQ"),
        (native_header(2), "TNQ"),
    ]


def test_native_sample_multiplicity_and_exact_mutations_are_retained():
    result = review_sequences(records(), RESIDUES, SELECTED)
    assert (
        result["sample_count"],
        result["unique_sequence_count"],
        result["wild_type_samples"],
    ) == (2, 1, 0)
    assert result["candidates"][1]["first_identical_sample"] == "sequence-001"
    assert result["candidates"][0]["mutations"] == [
        {"residue": "A566", "original": "S", "designed": "T"}
    ]
    assert result["candidates"][0]["ligand_likelihood"] == 0.2


def test_empty_native_ligand_mask_never_becomes_a_perfect_ligand_score():
    values = records(ligand_count=0)
    values[1] = (native_header(1, ligand="1.0000"), "TNQ")
    result = review_sequences(values, RESIDUES, SELECTED)
    assert result["native_ligand_scored_residues"] == 0
    assert all(value["ligand_likelihood"] is None for value in result["candidates"])


@pytest.mark.parametrize("failure", ["sequence", "identity", "scope", "probability"])
def test_invalid_or_misattributed_native_outputs_fail_closed(failure):
    values = records()
    residues, selected = RESIDUES, SELECTED
    if failure == "sequence":
        values[0] = (values[0][0], "SQQ")
    elif failure == "identity":
        values[1] = (native_header(7), "TNQ")
    elif failure == "scope":
        values[0] = (values[0][0].replace("num_res=3", "num_res=2"), "SNQ")
        selected = ["A588", "A590"]
    else:
        values[1] = (native_header(1, ligand="nan"), "TNQ")
    with pytest.raises(ValueError):
        review_sequences(values, residues, selected)
