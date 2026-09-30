"""Real RDKit parsing validates file/version handoffs on the remote CPU runner."""

from pathlib import Path

import pytest

from opendde_workbench import native_task

Chem = pytest.importorskip("rdkit.Chem")


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
