"""Real structural consumers remain portable without a deep-learning installation."""

import importlib.util
import sys
from pathlib import Path

import numpy as np
from Bio.PDB.Atom import Atom
from Bio.PDB.Chain import Chain
from Bio.PDB.Model import Model
from Bio.PDB.Residue import Residue

from opendde_workbench.proximity import native_frames


def load_consumer(name, filename, monkeypatch):
    source = Path(native_frames.__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, name, module)
    spec.loader.exec_module(module)
    return module


def partner(points):
    model, chain = Model(0), Chain("X")
    model.add(chain)
    residue = Residue((" ", 1, " "), "ALA", " ")
    chain.add(residue)
    identities = []
    for index, (name, position) in enumerate(zip(("N", "CA", "C"), points, strict=True), 1):
        residue.add(Atom(name, position.copy(), 0.0, 1.0, " ", name, index, element=name[0]))
        identities.append({"chain": "X", "number": 1, "atom": name, "element": name[0]})
    return {
        "model": model,
        "coordinates": points.copy(),
        "identities": identities,
        "source": {"record": 0},
    }


def test_quality_and_writer_use_real_source_atoms_without_a_model_framework(monkeypatch):
    # Neither dependency is needed for coordinate writing or independent checks.
    monkeypatch.setitem(sys.modules, "torch", None)
    monkeypatch.setitem(sys.modules, "deepternary", None)
    monkeypatch.setitem(sys.modules, "native_proximity_frames", native_frames)
    quality = load_consumer("native_proximity_quality", "native_quality.py", monkeypatch)
    outputs = load_consumer("portable_proximity_outputs", "native_outputs.py", monkeypatch)
    points = np.array([[1.0, 2.0, 3.0], [2.0, 3.0, 5.0], [-1.0, 4.0, 2.0]])
    partners = [partner(points), partner(points + 10)]
    prediction = {
        "rotation": np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]]),
        "translation": np.array([10.0, 2.0, -4.0]),
    }
    structure, mapping = outputs.assembly_models(partners, prediction)
    first = np.array([atom.coord for atom in structure[0]["A"].get_atoms()])
    second = np.array([atom.coord for atom in structure[0]["B"].get_atoms()])
    np.testing.assert_array_equal(first, points)
    moving = points + 10
    expected = np.column_stack((-moving[:, 1] + 10, moving[:, 0] + 2, moving[:, 2] - 4))
    np.testing.assert_array_equal(second, expected)
    np.testing.assert_array_equal(
        np.array([atom.coord for atom in partners[1]["model"].get_atoms()]), moving
    )
    assert [item["output_chain"] for item in mapping] == ["A", "B"]
    assert mapping[1]["atoms"] == partners[1]["identities"]
    assert quality.severe_pairs(np.zeros((1, 3)), [6], np.array([[1.5, 0, 0]]), [6]) == (1, 1.5)
