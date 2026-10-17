"""Real source records must agree with declared chemistry before GNINA is started."""

import importlib.util
import sys
from pathlib import Path

import pytest
from docking_source_tools import REFERENCE, load_tools
from rdkit import Chem


@pytest.fixture
def reader(monkeypatch):
    conformer, chemistry = load_tools(monkeypatch)
    monkeypatch.setitem(sys.modules, "docking_chemistry", chemistry)
    path = Path(__file__).resolve().parents[1] / "src/opendde_workbench/datasets/docking_inputs.py"
    spec = importlib.util.spec_from_file_location("docking_inputs", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return conformer, chemistry, module.candidate_molecule


def file_for(tmp_path, conformer, smiles):
    file = tmp_path / "candidates.sdf"
    with Chem.SDWriter(str(file)) as writer:
        for value in smiles:
            writer.write(conformer(Chem.MolFromSmiles(value), 101))
    return file


def test_exact_native_record_not_original_assay_ordinal_supplies_the_candidate(reader, tmp_path):
    conformer, chemistry, candidate = reader
    specified = REFERENCE.replace("CCC(O)C3", "CC[C@H](O)C3")
    file = file_for(tmp_path, conformer, [REFERENCE, specified])
    original = file.read_bytes()
    # Noncanonical equivalent source spelling must remain compatible across parsers.
    graph = Chem.MolFromSmiles(specified)
    reordered = Chem.RenumberAtoms(graph, list(reversed(range(graph.GetNumAtoms()))))
    declared = Chem.MolToSmiles(reordered, canonical=False)
    assert declared != Chem.MolToSmiles(graph)
    selected = candidate(
        tmp_path, {"artifact": file.name, "record": 1, "source_record": 999, "smiles": declared}
    )
    assert chemistry.plain_smiles(selected) == chemistry.plain_smiles(Chem.MolFromSmiles(specified))
    assert [a.GetAtomMapNum() for a in selected.GetAtoms()] == list(
        range(1, selected.GetNumAtoms() + 1)
    )
    assert file.read_bytes() == original


def test_the_contracts_implicit_first_record_still_requires_the_declared_chemistry(
    reader, tmp_path
):
    conformer, chemistry, candidate = reader
    file = file_for(tmp_path, conformer, [REFERENCE])
    selected = candidate(tmp_path, {"artifact": file.name, "smiles": REFERENCE})
    assert chemistry.plain_smiles(selected) == chemistry.plain_smiles(Chem.MolFromSmiles(REFERENCE))


@pytest.mark.parametrize(
    ("declared", "actual"),
    [
        (REFERENCE, REFERENCE.replace("CCC(O)C3", "CC[C@H](O)C3")),
        (
            REFERENCE.replace("CCC(O)C3", "CC[C@H](O)C3"),
            REFERENCE.replace("CCC(O)C3", "CC[C@@H](O)C3"),
        ),
        (REFERENCE, REFERENCE.replace("CCC(O)C3", "CCC(=O)C3")),
        ("", REFERENCE),
        ("not a chemical identity", REFERENCE),
    ],
)
def test_different_or_unverifiable_source_chemistry_is_rejected_without_altering_files(
    reader, tmp_path, declared, actual
):
    conformer, _, candidate = reader
    file = file_for(tmp_path, conformer, [actual])
    original = file.read_bytes()
    with pytest.raises(ValueError, match="differs from its recorded chemical identity or stereo"):
        candidate(tmp_path, {"artifact": file.name, "record": 0, "smiles": declared})
    assert file.read_bytes() == original
