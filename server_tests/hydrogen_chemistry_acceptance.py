"""Independently check native view folding retained chemical identity and donor valence."""

from pathlib import Path

from rdkit import Chem

from opendde_workbench.examples.stat6.catalogue import MANIFEST

root = Path(__file__).resolve().parents[1]
source = Chem.SDMolSupplier(
    str(root / "src/opendde_workbench/examples/stat6/inputs/STAT6-user-warhead.sdf"), removeHs=False
)[0]
assert source is not None
identity = Chem.MolToSmiles(Chem.RemoveHs(source), isomericSmiles=True)
for name in ("native-folded-preview.mol", "native-folded-editor.mol"):
    copy = Chem.MolFromMolFile(
        str(root / "server_tests/evidence/hydrogen-policy" / name), removeHs=False
    )
    assert copy is not None
    found = Chem.MolToSmiles(Chem.RemoveHs(copy), isomericSmiles=True)
    assert found == identity, {"file": name, "source": identity, "display": found}
    assert copy.GetNumHeavyAtoms() == source.GetNumHeavyAtoms()
    assert (
        sum(atom.GetTotalNumHs() for atom in copy.GetAtoms() if atom.GetSymbol() in {"N", "O", "S"})
        > 0
    )
for spec, name in zip(MANIFEST["molecules"], ("warhead", "protac"), strict=True):
    expected = Chem.MolFromSmiles(spec["original_smiles"])
    copy = Chem.MolFromMolFile(
        str(root / "server_tests/evidence/hydrogen-policy" / f"native-study-{name}.mol"),
        removeHs=False,
    )
    assert expected is not None and copy is not None
    assert Chem.MolToSmiles(Chem.RemoveHs(copy), isomericSmiles=True) == Chem.MolToSmiles(
        expected, isomericSmiles=True
    )
print("Native 2D view copies retain molecular identity, heavy atoms and donor hydrogen valence.")
