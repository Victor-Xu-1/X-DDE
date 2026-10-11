"""Molecular-only study guidance, without geometry calculations or new jobs."""

import pytest

from opendde_workbench.examples.stat6.guidance import steps


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
