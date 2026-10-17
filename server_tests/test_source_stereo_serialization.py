"""Real 3D files must retain declared and undeclared source stereochemistry."""

import hashlib
import importlib.util
import math
import sqlite3
import sys
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from rdkit import Chem
from rdkit.Chem import rdDepictor

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
UNSPECIFIED_REFERENCE = "NC(=O)c1cnc(Nc2ccc(N3CCC(O)C3)cc2)nc1NCc1ccccc1"


@pytest.fixture
def native(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "datasets"))
    monkeypatch.syspath_prepend(str(ROOT / "chemistry"))

    def load(name, file):
        spec = importlib.util.spec_from_file_location(name, file)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        return module

    load("platformnative_io", ROOT / "datasets/native_io.py")
    return (
        load("library_records", ROOT / "datasets/library_records.py"),
        load("native_minimization", ROOT / "chemistry/native_minimization.py"),
    )


def identity(molecule):
    return Chem.MolToSmiles(Chem.RemoveHs(Chem.Mol(molecule)), isomericSmiles=True)


@pytest.mark.parametrize(
    "smiles",
    [
        UNSPECIFIED_REFERENCE,  # CHEMBL458325: the actual STAT6 index readback failure.
        "COC(=O)[C@@H](N)[C@H](O)C1CC(O)C(F)C1",
        "NC(=O)c1ccc(NC(=O)C=Cc2ccccc2)cc1",
        "NC(=O)c1ccc(NC(=O)/C=C/c2ccccc2)cc1",
        "O=C(NCC[C@H]([13CH3])C(F)O)N1CCC(c2ccccc2)CC1",
    ],
)
def test_library_conformer_mol_and_sdf_roundtrip_preserve_source_identity(native, tmp_path, smiles):
    library, _ = native
    source = Chem.MolFromSmiles(smiles)
    expected = identity(source)
    pose = library.unbound_conformer(source, 101)
    points = pose.GetConformer().GetPositions().copy()
    assert pose.GetConformer().Is3D() and np.isfinite(points).all()
    assert source.GetNumConformers() == 0 and identity(source) == expected
    block = Chem.MolToMolBlock(pose)
    restored = Chem.MolFromMolBlock(block, removeHs=False)
    assert restored is not None and identity(restored) == expected
    file = tmp_path / "calculated-conformer.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(pose)
    saved = Chem.SDMolSupplier(str(file), removeHs=False)[0]
    assert saved is not None and identity(saved) == expected
    assert np.array_equal(pose.GetConformer().GetPositions(), points)
    assert np.max(np.abs(saved.GetConformer().GetPositions() - points)) < 1e-3


def test_real_initial_minimization_retains_unspecified_stereo_after_saved_file_parse(
    native, tmp_path
):
    _, minimization = native
    source = Chem.MolFromSmiles(UNSPECIFIED_REFERENCE)
    expected = identity(source)
    rdDepictor.Compute2DCoords(source)
    content = (Chem.MolToMolBlock(source) + "\n$$$$\n").encode()
    identifier = str(uuid4())
    job = tmp_path / "job"
    (job / "assets").mkdir(parents=True)
    file = job / "assets/source.sdf"
    file.write_bytes(content)
    output = tmp_path / "output"
    output.mkdir()
    request = {
        "molecule": {
            "asset_id": identifier,
            "sha256": hashlib.sha256(content).hexdigest(),
            "record": 0,
            "conformer": 0,
        },
        "options": {"initialize_3d": True, "seed": 2026, "max_iterations": 2000},
    }
    result = minimization.run_minimization(
        request, {identifier: "/job/assets/source.sdf"}, job, output
    )
    saved = Chem.SDMolSupplier(str(output / "minimized.sdf"), removeHs=False)[0]
    assert saved is not None and identity(saved) == expected
    assert result["identity_smiles"] == expected and result["identity_preserved"]
    assert result["converged"] and math.isfinite(result["energy_after"])
    assert result["energy_after"] <= result["energy_before"] + 1e-3
    assert file.read_bytes() == content


def test_actual_index_mol_readback_to_retrieval_sdf_preserves_unknown_and_known_stereo(
    native, tmp_path
):
    from drugclip_candidates import retain_candidates

    library, _ = native
    index = tmp_path / "index"
    index.mkdir()
    file = index / "index-members.sqlite"
    expected, blocks = [], []
    for smiles in (
        UNSPECIFIED_REFERENCE,
        UNSPECIFIED_REFERENCE.replace("CCC(O)C3", "CC[C@H](O)C3"),
    ):
        source = Chem.MolFromSmiles(smiles)
        expected.append(identity(source))
        block = Chem.MolToMolBlock(library.unbound_conformer(source, 101))
        assert identity(Chem.MolFromMolBlock(block, removeHs=False)) == expected[-1]
        blocks.append(block)
    with sqlite3.connect(file) as database:
        database.execute(
            "CREATE TABLE members (ordinal INTEGER PRIMARY KEY,id TEXT,display_name TEXT,"
            "source_job TEXT,source_record INTEGER,supplier TEXT,smiles TEXT,molblock TEXT)"
        )
        for ordinal, (smiles, block) in enumerate(zip(expected, blocks, strict=True)):
            database.execute(
                "INSERT INTO members VALUES (?,?,?,?,?,?,?,?)",
                (
                    ordinal,
                    "member-" + str(ordinal),
                    "STAT6 compound " + str(ordinal),
                    "source-library",
                    ordinal,
                    "custom",
                    smiles,
                    block,
                ),
            )
    original = file.read_bytes()
    output = tmp_path / "output"
    output.mkdir()
    request = {"payload": {"top_k": 2, "retain": 2}, "options": {"seed": 101}}
    rows, failures = retain_candidates(
        request,
        [(index, None, [], 2)],
        [(0.8, 0.8, 0, 0), (0.5, 0.5, 0, 1)],
        output=output,
    )
    assert not failures and len(rows) == 2
    saved = list(Chem.SDMolSupplier(str(output / "candidates.sdf"), removeHs=False))
    assert len(saved) == 2
    for ordinal, molecule in enumerate(saved):
        assert molecule is not None and identity(molecule) == expected[ordinal]
        source = Chem.MolFromMolBlock(blocks[ordinal], removeHs=False)
        assert np.array_equal(
            molecule.GetConformer().GetPositions(), source.GetConformer().GetPositions()
        )
    assert file.read_bytes() == original
