"""Real mapped 3D docking inputs must retain declared and source-unknown stereo."""

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest
from rdkit import Chem

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
REFERENCE = "NC(=O)c1cnc(Nc2ccc(N3CCC(O)C3)cc2)nc1NCc1ccccc1"


@pytest.fixture
def native_export(monkeypatch):
    for folder in ("datasets", "chemistry", "docking"):
        monkeypatch.syspath_prepend(str(ROOT / folder))

    def load(name, file):
        spec = importlib.util.spec_from_file_location(name, ROOT / file)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        return module

    load("platformnative_io", "datasets/native_io.py")
    library = load("library_records", "datasets/library_records.py")
    chemistry = load("docking_export", "docking/chemistry.py")
    return library.unbound_conformer, chemistry


@pytest.mark.parametrize(
    "smiles",
    [
        REFERENCE,  # Actual unknown-centre STAT6 candidate CHEMBL458325.
        REFERENCE.replace("CCC(O)C3", "CC[C@H](O)C3"),
        REFERENCE.replace("CCC(O)C3", "CC[C@@H](O)C3"),
        REFERENCE.replace("CCC(O)C3", "CCC(O)CC3"),  # Chemically symmetric CHEMBL517122.
        "COC(=O)[C@@H](N)[C@H](O)C1CC(O)C(F)C1",
        "NC(=O)c1ccc(NC(=O)C=Cc2ccccc2)cc1",
        "NC(=O)c1ccc(NC(=O)/C=C/c2ccccc2)cc1",
    ],
)
def test_native_mapped_docking_sdf_preserves_exact_source_stereo_and_coordinates(
    native_export, tmp_path, smiles
):
    conformer, chemistry = native_export
    pose = conformer(Chem.MolFromSmiles(smiles), 101)
    expected = chemistry.plain_smiles(pose)
    file = tmp_path / "calculated-source.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(pose)
    original = file.read_bytes()
    selected = chemistry.molecule(file, 0)
    mapping = [atom.GetAtomMapNum() for atom in selected.GetAtoms()]
    points = selected.GetConformer().GetPositions().copy()
    assert mapping == list(range(1, selected.GetNumAtoms() + 1))
    saved = tmp_path / "native-input.sdf"
    with Chem.SDWriter(str(saved)) as writer:
        writer.write(chemistry.export_molecule(selected))
    restored = Chem.SDMolSupplier(str(saved), removeHs=True)[0]
    assert restored is not None and chemistry.plain_smiles(restored) == expected
    assert [atom.GetAtomMapNum() for atom in restored.GetAtoms()] == mapping
    assert np.array_equal(restored.GetConformer().GetPositions(), points)
    assert np.array_equal(selected.GetConformer().GetPositions(), points)
    assert chemistry.plain_smiles(selected) == expected and file.read_bytes() == original


def test_docking_export_preserves_native_scores_and_never_collapses_known_stereoisomers(
    native_export, tmp_path
):
    conformer, chemistry = native_export
    identities = []
    for index, tag in enumerate(("@", "@@")):
        mol = conformer(Chem.MolFromSmiles(REFERENCE.replace("CCC(O)C3", f"CC[C{tag}H](O)C3")), 101)
        mol.SetDoubleProp("minimizedAffinity", -7.125)
        file = tmp_path / f"scored-{index}.sdf"
        with Chem.SDWriter(str(file)) as writer:
            writer.write(chemistry.export_molecule(mol))
        restored = Chem.SDMolSupplier(str(file), removeHs=True)[0]
        assert restored.GetDoubleProp("minimizedAffinity") == -7.125
        identities.append(chemistry.plain_smiles(restored))
        assert identities[-1] == chemistry.plain_smiles(mol)
    assert identities[0] != identities[1]
