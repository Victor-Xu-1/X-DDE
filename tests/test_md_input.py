"""Peptide geometry and explicit chain boundaries before either dynamics engine."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from opendde_workbench.integrations.backend import ScientificBackend
from opendde_workbench.settings import Settings
from opendde_workbench.simulations.native_md_input import validate_peptide_links


def topology(chains):
    positions = []
    result = []
    for chain_id, rows in chains:
        residues = []
        for identifier, name, coordinates in rows:
            atoms = []
            for atom_name, point in coordinates.items():
                atoms.append(SimpleNamespace(name=atom_name, index=len(positions)))
                positions.append(point)
            residues.append(
                SimpleNamespace(id=identifier, name=name, atoms=lambda atoms=atoms: iter(atoms))
            )
        result.append(SimpleNamespace(id=chain_id, residues=lambda rows=residues: iter(rows)))
    return SimpleNamespace(chains=lambda: iter(result)), positions


def pair(distance=1.33, next_id="2"):
    return [
        ("1", "ALA", {"N": (-2, 0, 0), "CA": (-1, 0, 0), "C": (0, 0, 0)}),
        (
            next_id,
            "GLY",
            {"N": (distance, 0, 0), "CA": (distance + 1, 0, 0), "C": (distance + 2, 0, 0)},
        ),
    ]


@pytest.mark.parametrize("next_id", ["2", "25", "2A"])
def test_valid_links_do_not_invent_missing_residues_from_author_numbering(next_id):
    value, positions = topology([("A", pair(next_id=next_id))])
    original = positions.copy()
    validate_peptide_links(value, positions)
    assert positions == original


@pytest.mark.parametrize("distance", [0.5, 2.1, 20, float("nan"), float("inf")])
def test_broken_or_nonfinite_links_are_rejected_before_solvation(distance):
    value, positions = topology([("A", pair(distance))])
    with pytest.raises(ValueError, match="peptide link.*chain A.*1.*2"):
        validate_peptide_links(value, positions)


def test_explicit_chain_breaks_are_never_bridged():
    rows = pair(20)
    value, positions = topology([("A", rows[:1]), ("A", rows[1:])])
    validate_peptide_links(value, positions)


def test_nonprotein_records_do_not_create_peptide_links():
    rows = pair(20)
    value, positions = topology([("A", [rows[0], ("3", "DA", {"P": (1, 0, 0)}), rows[1]])])
    validate_peptide_links(value, positions)


def test_incomplete_repaired_backbone_is_rejected():
    rows = pair()
    del rows[1][2]["N"]
    value, positions = topology([("A", rows)])
    with pytest.raises(ValueError, match="backbone.*chain A.*2"):
        validate_peptide_links(value, positions)


def test_missing_atoms_can_be_repaired_but_known_bad_links_cannot():
    rows = pair(20)
    del rows[0][2]["CA"]
    value, positions = topology([("A", rows)])
    with pytest.raises(ValueError, match="peptide link"):
        validate_peptide_links(value, positions, require_complete=False)
    rows = pair()
    del rows[1][2]["N"]
    value, positions = topology([("A", rows)])
    validate_peptide_links(value, positions, require_complete=False)


@pytest.mark.parametrize("engine", ["openmm", "gromacs"])
def test_both_dynamics_engines_mount_the_same_input_validation(tmp_path, engine):
    settings = Settings(
        state_dir=tmp_path,
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
    )
    backend = ScientificBackend(settings, engine)
    expected = Path(__file__).parents[1] / "src/opendde_workbench/simulations/native_md_input.py"
    assert backend.shared_sources["native_md_input.py"] == expected
    assert "native_md_input.py" in backend.files
    assert len(backend.files) == len(set(backend.files)) <= 32
