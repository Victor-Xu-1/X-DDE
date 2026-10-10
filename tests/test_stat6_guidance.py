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
