"""Real RDKit geometry controls, executed inside the pinned isolated GNINA image."""

import json
import math
import tempfile
from pathlib import Path

import numpy as np
import reference
from rdkit import Chem
from reference import ReferenceGeometry


def molecule(smiles, positions=None):
    mol = Chem.MolFromSmiles(smiles)
    conformer = Chem.Conformer(mol.GetNumAtoms())
    for index in range(mol.GetNumAtoms()):
        conformer.SetAtomPosition(
            index, positions[index] if positions is not None else (index * 1.4, 0, 0)
        )
    conformer.Set3D(True)
    mol.AddConformer(conformer)
    return mol


def main():
    with tempfile.TemporaryDirectory() as directory:
        protein = Path(directory) / "receptor.pdb"
        Chem.MolToPDBFile(molecule("N", [(0, 0, 2)]), str(protein))
        source = molecule("CCCCN")
        original = np.asarray(source.GetConformer().GetPositions()).copy()
        control = ReferenceGeometry(source, source, protein, {"asset_id": "fixture"}, "input_pose")
        assert control.metadata["heavy_atom_count"] == 5
        assert control.metadata["contact_atom_count"] == 3
        assert control.measure(source) == {"all_heavy": 0, "contact": 0}
        translated = Chem.Mol(source)
        for i, p in enumerate(original):
            translated.GetConformer().SetAtomPosition(i, tuple(p + (1, 0, 0)))
        measured = control.measure(translated)
        assert math.isclose(measured["all_heavy"], 1, abs_tol=1e-8)
        assert math.isclose(measured["contact"], 1, abs_tol=1e-8)
        rotated = Chem.Mol(source)
        for i, p in enumerate(original):
            rotated.GetConformer().SetAtomPosition(i, tuple(-p))
        assert control.measure(rotated)["all_heavy"] > 2
        reordered = Chem.RenumberAtoms(source, list(reversed(range(5))))
        assert control.measure(reordered)["all_heavy"] == 0
        for atom in reordered.GetAtoms():
            atom.SetAtomMapNum(atom.GetIdx() + 1)
        assert control.measure(reordered)["all_heavy"] == 0
        hydrogenated = Chem.AddHs(source, addCoords=True)
        for atom in hydrogenated.GetAtoms():
            if atom.GetAtomicNum() == 1:
                hydrogenated.GetConformer().SetAtomPosition(atom.GetIdx(), (100, 100, 100))
        assert control.measure(hydrogenated)["all_heavy"] == 0
        assert np.array_equal(original, np.asarray(source.GetConformer().GetPositions()))
        different = ReferenceGeometry(
            source, molecule("CCCC[NH3+]"), protein, {}, "search_reference"
        )
        assert different.metadata["status"] == "different_chemical_state"
        assert different.measure(source) is None
        chiral = ReferenceGeometry(
            molecule("F[C@H](Cl)Br"), molecule("F[C@@H](Cl)Br"), protein, {}, "search_reference"
        )
        assert chiral.metadata["status"] == "different_chemical_state"
        symmetric = molecule("CC(C)C")
        reference.MATCH_LIMIT = 1
        limited = ReferenceGeometry(symmetric, symmetric, protein, {}, "search_reference")
        assert limited.metadata["status"] == "symmetry_limit" and limited.measure(symmetric) is None
        reference.MATCH_LIMIT = 4096
        Chem.MolToPDBFile(molecule("N", [(100, 0, 0)]), str(protein))
        distant = ReferenceGeometry(source, source, protein, {}, "input_pose")
        assert distant.metadata["contact_atom_count"] == 0
        assert distant.measure(source)["contact"] is None
        print(
            json.dumps(
                {
                    "translation_no_fit": measured,
                    "atom_reordering_and_maps": "preserved",
                    "hydrogens_excluded": True,
                    "charge_and_stereochemistry_mismatch": "unavailable",
                    "symmetry_limit": "no partial result",
                    "no_contacts": None,
                }
            )
        )


if __name__ == "__main__":
    main()
