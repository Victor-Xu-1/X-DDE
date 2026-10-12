"""Original compound names survive native descriptor output and spreadsheet export."""

import csv
from pathlib import Path

from rdkit import Chem

from opendde_workbench.native_runtime import property_calculation as task
from opendde_workbench.requests import Properties


def test_descriptor_execution_budget_does_not_rewrite_historical_request_json():
    request = Properties(name="Exact descriptors", smiles=["O=C(N)c1ccccc1"])
    assert request.options.cpu == 1 and request.options.memory_mib == 2048
    assert "options" not in request.model_dump(mode="json")


def test_native_compound_identity_and_selected_record_are_preserved(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(task.__file__).parent))
    source = tmp_path / "series.sdf"
    with Chem.SDWriter(str(source)) as writer:
        for name, smiles in (
            ("original-one", "O=C(N)c1ccccc1"),
            ("original-two", "O=C(O)c1ccccc1"),
        ):
            molecule = Chem.MolFromSmiles(smiles)
            molecule.SetProp("_Name", name)
            if name == "original-two":
                molecule.SetProp("Compound_ID", "CHEMBL-reviewed-record")
            writer.write(molecule)
    original = source.read_bytes()
    reference = {"asset_id": "series", "record": 1, "sha256": "a" * 64}
    output = task.properties(
        {"smiles": [], "ligand_files": ["series"], "scientific_inputs": [reference]},
        {"series": str(source)},
        tmp_path,
    )
    assert len(output["molecules"]) == 1
    record = output["molecules"][0]
    assert record["name"] == "CHEMBL-reviewed-record"
    assert record["input"] == "series:2" and record["scientific_reference"] == reference
    assert record["available"] and Chem.MolFromSmiles(record["smiles"]) is not None
    with (tmp_path / "properties.csv").open(encoding="utf-8-sig", newline="") as stream:
        assert list(csv.DictReader(stream))[0]["name"] == record["name"]
    assert source.read_bytes() == original
