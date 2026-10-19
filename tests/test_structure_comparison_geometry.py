"""Native rigid-frame controls, never evidence of a real STAT6 research result."""

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from Bio.PDB import Atom, Chain, Model, Residue


@pytest.fixture
def geometry(monkeypatch):
    root = Path(__file__).parents[1] / "src/opendde_workbench"
    monkeypatch.syspath_prepend(str(root / "receptors"))
    from opendde_workbench.structure_comparison import native_geometry

    return native_geometry


def model(target, partner):
    value = Model.Model(0)
    profiles = {}
    for name, points in (("A", target), ("B", partner)):
        chain = Chain.Chain(name)
        value.add(chain)
        rows = []
        for i, point in enumerate(points):
            residue = Residue.Residue((" ", i + 1, " "), "ALA", " ")
            atom = Atom.Atom("CA", np.asarray(point, dtype=float), 0, 1, " ", " CA ", i + 1, "C")
            residue.add(atom)
            chain.add(residue)
            rows.append(("A", atom, {"chain": name, "number": i + 1, "insertion_code": ""}))
        profiles[name] = rows
    return value, profiles


def test_partner_is_evaluated_in_the_target_frame_not_independently_refitted(geometry):
    target = np.asarray([[0, 0, 0], [2, 0, 0], [0, 3, 0], [1, 1, 2]], dtype=float)
    partner = np.asarray([[0, 0, 5], [2, 0, 5], [0, 3, 5]], dtype=float)
    reference, left = model(target, partner)
    before = [atom.coord.copy() for atom in reference.get_atoms()]
    shift = np.asarray([10, -4, 3])
    moving, right = model(target + shift, partner + shift + [0, 0, 4])
    result = geometry.compare_frame(
        moving,
        list(zip(left["A"], right["A"], strict=True)),
        list(zip(left["B"], right["B"], strict=True)),
    )
    assert result["target_rmsd_angstrom"] == pytest.approx(0, abs=1e-12)
    assert result["partner_rmsd_angstrom"] == pytest.approx(4)
    np.testing.assert_allclose(
        [atom.coord for atom in moving["B"].get_atoms()], partner + [0, 0, 4]
    )
    np.testing.assert_array_equal([atom.coord for atom in reference.get_atoms()], before)
    assert all(
        row["displacement_angstrom"] == pytest.approx(4)
        for row in result["residue_displacements"]
        if row["role"] == "partner"
    )


def test_unstable_alignment_fails_before_coordinates_change(geometry):
    moving, rows = model([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [[0, 0, 2]])
    before = [atom.coord.copy() for atom in moving.get_atoms()]
    pairs = [(row, row) for row in rows["A"]]
    with pytest.raises(ValueError, match="Collinear"):
        geometry.compare_frame(moving, pairs, [(rows["B"][0], rows["B"][0])])
    np.testing.assert_array_equal([atom.coord for atom in moving.get_atoms()], before)


def test_existing_ensemble_rmsd_gate_still_precedes_model_mutation(geometry):
    from native_fit import fit

    target = np.asarray([[0, 0, 0], [2, 0, 0], [0, 3, 0]], dtype=float)
    _, left = model(target, [[0, 0, 5]])
    moving, right = model(target * 2, [[0, 0, 5]])
    before = [atom.coord.copy() for atom in moving.get_atoms()]
    with pytest.raises(ValueError, match="threshold"):
        fit(
            moving,
            list(zip(left["A"], right["A"], strict=True)),
            SimpleNamespace(maximum_rmsd_angstrom=0.1),
        )
    np.testing.assert_array_equal([atom.coord for atom in moving.get_atoms()], before)
