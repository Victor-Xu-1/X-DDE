"""Exact managed-RDKit parsing and frozen adapter export, not diffusion inference."""

import hashlib
import importlib.util
import sys
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"


@pytest.fixture
def native(tmp_path, monkeypatch):
    def load(name, path):
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        return module

    snapshot = load("isolated_diffsbdd_snapshot", ROOT / "diffsbdd/snapshot.py")
    entry, digests = snapshot.capture(tmp_path)
    shared = ROOT / "chemistry/molfile_stereo.py"
    assert (entry.parent / shared.name).read_bytes() == shared.read_bytes()
    assert digests[shared.name] == hashlib.sha256(shared.read_bytes()).hexdigest()
    monkeypatch.syspath_prepend(str(entry.parent))
    serialization = load("molfile_stereo", entry.parent / shared.name)
    chemistry = load("isolated_diffsbdd_chemistry", entry.parent / "chemistry.py")
    return chemistry, serialization


def selection(tmp_path, native, content, *, collection=False):
    chemistry, _ = native
    directory = tmp_path / "job"
    (directory / "assets").mkdir(parents=True)
    source = directory / "assets/source.sdf"
    source.write_bytes(content)
    output = tmp_path / "output"
    output.mkdir()
    ref = {
        "asset_id": str(uuid4()),
        "sha256": hashlib.sha256(content).hexdigest(),
        "record": 0,
        "conformer": 0,
    }
    bindings = {ref["asset_id"]: "/job/assets/source.sdf"}
    if collection:
        result = chemistry.molecular_collection(
            {"mode": "export", "molecules": [ref]}, bindings, directory, output
        )
        assert result["molecules"][0]["available"]
        target = output / result["artifact"]
    else:
        result = chemistry.inspect_identity({"molecule": ref}, bindings, directory, output)
        assert result["identity_basis"] == "rdkit_removeHs_record_order"
        assert result["reference"] == ref
        target = output / result["molecule_artifact"]
    assert source.read_bytes() == content
    return result, Chem.SDMolSupplier(str(target), removeHs=False)[0]


@pytest.mark.parametrize("collection", [False, True])
def test_real_stat6_protac_identity_and_export_retain_unknown_stereo_and_coordinates(
    native, tmp_path, collection
):
    source = ROOT / "examples/stat6/inputs/STAT6-user-PROTAC-stereo-uncertainty-v2.sdf"
    original = Chem.SDMolSupplier(str(source), removeHs=False)[0]
    expected = Chem.RemoveHs(original)
    assert Chem.MolToSmiles(expected) == Chem.MolToSmiles(
        Chem.MolFromSmiles(original.GetProp("Original_SMILES"))
    )
    assert "@" not in Chem.MolToSmiles(expected)
    result, retained = selection(tmp_path, native, source.read_bytes(), collection=collection)
    assert retained is not None
    heavy = Chem.RemoveHs(retained)
    assert Chem.MolToSmiles(heavy, isomericSmiles=True) == Chem.MolToSmiles(
        expected, isomericSmiles=True
    )
    assert np.array_equal(
        heavy.GetConformer().GetPositions(), expected.GetConformer().GetPositions()
    )
    assert heavy.GetConformer().Is3D() and np.ptp(heavy.GetConformer().GetPositions()[:, 2]) > 1
    if not collection:
        assert [(atom["index"], atom["element"]) for atom in result["atoms"]] == [
            (atom.GetIdx(), atom.GetSymbol()) for atom in expected.GetAtoms()
        ]


@pytest.mark.parametrize(
    "smiles",
    [
        "COC(=O)[C@@H](N)[C@H](O)C1CC(O)C(F)C1",
        "NC(=O)c1ccc(NC(=O)C=Cc2ccccc2)cc1",
        "NC(=O)c1ccc(NC(=O)/C=C/c2ccccc2)cc1",
        "O=C(NCC[C@H]([13CH3])C(F)O)N1CCC(c2ccccc2)CC1",
    ],
)
def test_specified_and_unspecified_centres_double_bonds_and_isotopes_survive(
    native, tmp_path, smiles
):
    _, serialization = native
    molecule = Chem.AddHs(Chem.MolFromSmiles(smiles))
    assert AllChem.EmbedMolecule(molecule, randomSeed=2026) == 0
    assert AllChem.MMFFOptimizeMolecule(molecule, mmffVariant="MMFF94s", maxIters=2000) == 0
    source = serialization.source_stereo_molecule(molecule)
    block = Chem.MolToMolBlock(source) + "\n$$$$\n"
    _, retained = selection(tmp_path, native, block.encode())
    assert retained is not None
    expected = Chem.RemoveHs(Chem.MolFromMolBlock(block, removeHs=False))
    assert Chem.MolToSmiles(Chem.RemoveHs(retained), isomericSmiles=True) == Chem.MolToSmiles(
        expected, isomericSmiles=True
    )
    assert Chem.MolToSmiles(expected, isomericSmiles=True) == Chem.MolToSmiles(
        Chem.MolFromSmiles(smiles), isomericSmiles=True
    )
    assert np.array_equal(
        retained.GetConformer().GetPositions(), expected.GetConformer().GetPositions()
    )
