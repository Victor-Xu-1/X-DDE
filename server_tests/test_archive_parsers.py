"""Independent fixed native parsers consume the actual protocol acceptance outputs in CI."""

from pathlib import Path

from Bio.PDB import MMCIFParser, PDBParser
from rdkit import Chem


def test_actual_archives_have_parsable_matching_chemical_and_structural_records():
    root = Path("server_tests/evidence/archive-fixture")
    cif = MMCIFParser(QUIET=True).get_structure("1CRN", root / "1CRN.cif")
    pdb = PDBParser(QUIET=True).get_structure("1CRN", root / "1CRN.pdb")
    assert len(list(cif.get_atoms())) == len(list(pdb.get_atoms())) > 100
    assert len(list(cif.get_residues())) == 46
    molecules = list(Chem.SDMolSupplier(str(root / "CHEMBL25.sdf")))
    assert len(molecules) == 1 and molecules[0] is not None
    assert Chem.MolToSmiles(molecules[0]) == Chem.MolToSmiles(
        Chem.MolFromSmiles("CC(=O)Oc1ccccc1C(=O)O")
    )
