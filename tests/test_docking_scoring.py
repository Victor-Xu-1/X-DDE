"""Requested neural scoring must not become an empirical-only success."""

from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.docking.manifest import BINARY_SHA256, VERSION
from opendde_workbench.docking.result import DockingResult
from opendde_workbench.docking.scoring import parse_score_only, require_score_names, select_pose

NATIVE_LOG = "Affinity: -6.23894 (kcal/mol)\nCNNscore: 0.53717\nCNNaffinity: 6.99256\n"


def result_body():
    receptor = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    ligand = {"asset_id": str(uuid4()), "sha256": "b" * 64}
    return {
        "operation": "docking",
        "complete": True,
        "mode": "score",
        "method": "GNINA",
        "software_version": VERSION,
        "binary_sha256": BINARY_SHA256,
        "parser": "RDKit 2023.09.6",
        "receptor": receptor,
        "ligand": ligand,
        "frame": receptor,
        "options": {"cnn_scoring": "rescore"},
        "search": None,
        "initial_conformer_generated": False,
        "poses": [
            {
                "record": 0,
                "valid": True,
                "artifact": "pose-001.sdf",
                "smiles": "CC(=O)N",
                "mapping_status": "native_atom_maps",
                "source_to_pose_atoms": [0, 1, 2, 3],
                "scores": parse_score_only(NATIVE_LOG, "rescore"),
            }
        ],
        "pose_artifact": "poses.sdf",
        "receptor_artifact": "receptor.pdb",
        "scientific_outcome": "candidates",
        "scientific_acceptance": "pending_server_validation",
        "coordinate_provenance": "user_confirmed",
        "notes": "Not experimental affinity.",
    }


@pytest.mark.parametrize("cnn", ["rescore", "refinement", "all"])
@pytest.mark.parametrize("missing", ["minimizedAffinity", "CNNscore", "CNNaffinity"])
def test_requested_neural_fields_are_required_by_the_result_contract(cnn, missing):
    value = result_body()
    value["mode"] = "score" if cnn == "rescore" else "minimize"
    value["options"].update(cnn_scoring=cnn, use_gpu=True)
    assert DockingResult.model_validate(value).poses[0].valid
    value["poses"][0]["scores"] = [
        score for score in value["poses"][0]["scores"] if score["name"] != missing
    ]
    with pytest.raises(ValidationError):
        DockingResult.model_validate(value)


@pytest.mark.parametrize("missing", ["Affinity", "CNNscore", "CNNaffinity"])
def test_score_only_parser_rejects_missing_native_fields_instead_of_silent_fallback(missing):
    text = "\n".join(line for line in NATIVE_LOG.splitlines() if not line.startswith(missing + ":"))
    with pytest.raises(ValueError, match="requested|missing"):
        parse_score_only(text, "rescore")


@pytest.mark.parametrize("invalid", ["nan", "inf", "-inf", "invalid", "1e999"])
def test_requested_neural_values_must_be_finite_numbers(invalid):
    with pytest.raises(ValueError):
        parse_score_only(NATIVE_LOG.replace("0.53717", invalid), "rescore")


def test_duplicate_native_scores_are_not_an_unambiguous_completed_calculation():
    with pytest.raises(ValueError, match="exactly one"):
        parse_score_only(NATIVE_LOG + "CNNscore: 0.9\n", "rescore")
    with pytest.raises(ValueError):
        require_score_names(["minimizedAffinity", "CNNscore", "CNNscore"], "rescore")


def test_empirical_only_mode_and_legacy_serialization_keep_their_original_contract():
    value = result_body()
    value["options"]["cnn_scoring"] = "none"
    value["poses"][0]["scores"] = parse_score_only("Affinity: -6.23894 (kcal/mol)\n", "none")
    original = deepcopy(value)
    parsed = DockingResult.model_validate(value)
    dumped = parsed.model_dump(mode="json")
    assert "reference_comparison" not in dumped
    assert "search_report" not in dumped
    assert "reference_rmsd" not in dumped["poses"][0]
    assert [score["name"] for score in dumped["poses"][0]["scores"]] == ["minimizedAffinity"]
    assert value == original
    with pytest.raises(ValidationError, match="only valid for docking"):
        DockingResult.model_validate(
            {
                **value,
                "search_report": {
                    "center": [1, 2, 3],
                    "size": [20, 20, 20],
                    "automatic_ligand_extension": False,
                },
            }
        )
    value["poses"][0]["scores"].extend(parse_score_only(NATIVE_LOG, "rescore")[1:])
    with pytest.raises(ValidationError, match="Disabled CNN"):
        DockingResult.model_validate(value)


def test_batch_pose_selection_uses_the_requested_neural_method_without_mixing_scores():
    neural_preferred = {
        "record": 0,
        "valid": True,
        "scores": parse_score_only(NATIVE_LOG, "rescore"),
    }
    empirical_preferred = {
        "record": 1,
        "valid": True,
        "scores": parse_score_only(
            NATIVE_LOG.replace("-6.23894", "-8.62547").replace("0.53717", "0.06524"), "rescore"
        ),
    }
    poses = [neural_preferred, empirical_preferred]
    original = deepcopy(poses)
    assert select_pose(poses, "rescore") is neural_preferred
    assert poses == original
    empirical = [
        {
            **pose,
            "scores": [score for score in pose["scores"] if score["name"] == "minimizedAffinity"],
        }
        for pose in poses
    ]
    assert select_pose(empirical, "none")["record"] == empirical_preferred["record"]
    assert poses == original


def test_batch_selection_keeps_native_ties_and_excludes_rejected_or_incomplete_outputs():
    first = {"record": 0, "valid": True, "scores": parse_score_only(NATIVE_LOG, "rescore")}
    second = {**deepcopy(first), "record": 1}
    assert select_pose([first, second], "rescore") is first
    assert select_pose([{**first, "valid": False}, second], "rescore") is second
    with pytest.raises(ValueError):
        select_pose([{**first, "scores": first["scores"][:1]}], "rescore")
    with pytest.raises(ValueError):
        select_pose([{**first, "valid": False}], "rescore")
