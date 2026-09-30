"""Real RDKit parsing validates file/version handoffs on the remote CPU runner."""

import importlib.util
from pathlib import Path

import pytest

Chem = pytest.importorskip("rdkit.Chem")
source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/native_task.py"
spec = importlib.util.spec_from_file_location("native_task", source)
native_task = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native_task)


def test_property_handoff_selects_one_real_sdf_record(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(native_task.__file__).parent))
    monkeypatch.setattr(native_task, "OUTPUT", tmp_path)
    file = tmp_path / "library.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(Chem.MolFromSmiles("CCO"))
        writer.write(Chem.MolFromSmiles("c1ccccc1"))
    ref = {
        "asset_id": "input",
        "record": 1,
        "conformer": 0,
        "version_id": "saved-version",
        "sha256": "a" * 64,
    }
    request = {"smiles": [], "ligand_files": ["input"], "scientific_inputs": [ref]}
    result = native_task.properties(request, {"input": str(file)})
    assert len(result["molecules"]) == 1
    molecule = result["molecules"][0]
    assert molecule["smiles"] == "c1ccccc1"
    assert molecule["scientific_reference"] == ref
    assert molecule["mw"] == pytest.approx(78.114, abs=0.01)
    request["scientific_inputs"] = []
    assert len(native_task.properties(request, {"input": str(file)})["molecules"]) == 2
    request["scientific_inputs"] = [{**ref, "record": 2}]
    with pytest.raises(ValueError, match="record is missing"):
        native_task.properties(request, {"input": str(file)})


def test_diffsbdd_atom_identity_uses_real_parser_and_exact_record(tmp_path):
    import hashlib

    from rdkit.Chem import AllChem

    source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/diffsbdd/chemistry.py"
    spec = importlib.util.spec_from_file_location("xdde_chemistry", source)
    chemistry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chemistry)
    (tmp_path / "assets").mkdir()
    path = tmp_path / "assets/library.sdf"
    with Chem.SDWriter(str(path)) as writer:
        for smiles in ["CCO", "c1ccccc1"]:
            mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
            assert AllChem.EmbedMolecule(mol, randomSeed=2026) == 0
            writer.write(mol)
    ref = {
        "asset_id": "input",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "record": 1,
        "conformer": 0,
    }
    result = chemistry.inspect_identity(
        {"molecule": ref}, {"input": "/job/assets/library.sdf"}, tmp_path, tmp_path
    )
    assert result["reference"] == ref
    assert [a["index"] for a in result["atoms"]] == list(range(6))
    assert all(a["element"] == "C" and a["selectable"] for a in result["atoms"])
    normalized = Chem.SDMolSupplier(str(tmp_path / result["molecule_artifact"]))[0]
    assert Chem.MolToSmiles(normalized) == "c1ccccc1"
    ref["sha256"] = "a" * 64
    with pytest.raises(ValueError, match="digest changed"):
        chemistry.inspect_identity(
            {"molecule": ref}, {"input": "/job/assets/library.sdf"}, tmp_path, tmp_path
        )
