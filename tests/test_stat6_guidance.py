"""Molecular-only study guidance, without geometry calculations or new jobs."""

import pytest

from opendde_workbench.examples.stat6.guidance import steps
from opendde_workbench.examples.stat6.request_replay import replay_context


def test_reviewed_monomer_recipe_does_not_receive_small_molecule_complex_instructions():
    study = {"required_materials": ["old material"], "guide": {"steps": steps("predict")}}
    request = {
        "components": [
            {
                "kind": "protein",
                "count": 1,
                "value": "ACDE",
                "unpaired_msa": "sealed-alignment-fixture",
            }
        ]
    }
    guidance = replay_context(study, "predict", request)
    assert guidance["required_materials"] == []
    english = " ".join(item[1] for item in guidance["guide"]["steps"])
    assert "protein sequence" in english and "saved unpaired MSA" in english
    assert "small molecule" not in english and "complex" not in english
    assert "binding activity" in guidance["guide"]["interpretation"][1]
    assert study["required_materials"] == ["old material"]
    complex_request = {"components": [*request["components"], {"kind": "ligand", "count": 1}]}
    assert replay_context(study, "predict", complex_request)["guide"] == study["guide"]
    assert replay_context(study, "predict")["guide"] == study["guide"]
    without_msa = {"components": [{"kind": "protein", "count": 1, "value": "ACDE"}]}
    assert "MSA" not in replay_context(study, "predict", without_msa)["guide"]["steps"][1][1]


def test_fold_guidance_names_deposited_constructs_and_pathway_scope():
    guidance = steps("fold")
    assert len(guidance) == 4 and all(len(item) == 2 for item in guidance)
    english = " ".join(item[1] for item in guidance)
    assert all(length in english for length in ("125-aa", "112-aa", "218-aa"))
    assert "IL-4Rα" in english and "not a direct anti-STAT6 antibody" in english
    assert "experimental reference" in english and "functional experiments" in english


def test_library_selection_instructions_preserve_assay_and_chemical_method_scope():
    guidance = steps("chemistry.screen")
    assert len(guidance) == 4 and all(len(item) == 2 for item in guidance)
    english = " ".join(item[1] for item in guidance)
    assert "cellular assay" in english and "do not rank activity" in english
    assert "not silently desalted" in english
    assert "protein pocket" not in english and "research region" not in english


@pytest.mark.parametrize("capability", ["properties", "admet.predict"])
def test_molecular_steps_match_their_input_and_confirmation_contracts(capability):
    guidance = steps(capability)
    assert len(guidance) == 4 and all(len(item) == 2 for item in guidance)
    assert "STAT6" in guidance[0][1]
    assert "not required" in guidance[1][1] or "does not require" in guidance[1][1]
    assert "select a research region" not in " ".join(item[1] for item in guidance)
    assert "submission" in guidance[3][1]


@pytest.mark.parametrize("capability", ["openmm.dynamics", "gromacs.dynamics"])
def test_dynamics_instructions_match_material_length_conditions_and_review(capability):
    guidance = steps(capability)
    assert len(guidance) == 4 and all(len(item) == 2 for item in guidance)
    assert "STAT6" in guidance[0][1] and "bound ligand pose" in guidance[0][1]
    assert "sampling" in guidance[1][1]
    assert "compute device" in guidance[2][1]
    assert "source files" in guidance[3][1] and "submission" in guidance[3][1]
    assert "select a research region" not in " ".join(item[1] for item in guidance)


def test_fep_instructions_match_record_selection_and_do_not_imply_completed_energies():
    guidance = steps("openfe.rbfe")
    assert len(guidance) == 4 and all(len(item) == 2 for item in guidance)
    assert "aligned" in guidance[0][1] and "STAT6" in guidance[0][1]
    assert "2–12 distinct" in guidance[1][1] and "record numbers" in guidance[1][1]
    assert "Plan" in guidance[2][1] and "then calculate" in guidance[2][1]
    assert "2D structure" in guidance[3][1] and "calculation stage" in guidance[3][1]
    assert "protein pocket" not in " ".join(item[1] for item in guidance)
