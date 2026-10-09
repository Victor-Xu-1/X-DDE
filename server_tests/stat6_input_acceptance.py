"""Check actual study chemistry and coordinate provenance, without docking or inference."""

import hashlib
import json
from pathlib import Path

import numpy as np
from Bio.PDB import MMCIFParser, PDBParser
from Bio.PDB.MMCIF2Dict import MMCIF2Dict
from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench/examples/stat6"
manifest = json.loads((ROOT / "manifest.json").read_text())
report = {"molecules": [], "reference_frames": [], "scientific_jobs": 0}
for row in manifest["molecules"]:
    path = ROOT / "inputs" / row["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"]
    molecules = list(Chem.SDMolSupplier(str(path), removeHs=False))
    assert len(molecules) == 1 and molecules[0] is not None
    molecule = molecules[0]
    original = Chem.MolFromSmiles(row["original_smiles"])
    assert original is not None and molecule.GetProp("Original_SMILES") == row["original_smiles"]
    assert Chem.MolToSmiles(Chem.RemoveHs(molecule), isomericSmiles=False) == Chem.MolToSmiles(
        original, isomericSmiles=False
    )
    coordinates = molecule.GetConformer().GetPositions()
    assert np.isfinite(coordinates).all() and molecule.GetConformer().Is3D()
    depth = np.linalg.svd(coordinates - coordinates.mean(axis=0), compute_uv=False)[-1]
    assert depth > 0.05 and molecule.GetNumHeavyAtoms() == row["heavy_atoms"]
    assert AllChem.MMFFHasAllMoleculeParams(molecule)
    properties = AllChem.MMFFGetMoleculeProperties(molecule, mmffVariant="MMFF94s")
    energy = AllChem.MMFFGetMoleculeForceField(molecule, properties).CalcEnergy()
    assert abs(energy - row["energy_kcal_mol"]) < 0.05
    assert "not a binding pose" in molecule.GetProp("Geometry")
    report["molecules"].append(
        {
            "file": path.name,
            "heavy_atoms": molecule.GetNumHeavyAtoms(),
            "nonplanarity": float(depth),
            "energy_kcal_mol": energy,
        }
    )

for source_id, derived_name in [
    ("9BIG", "STAT6-9BIG-observed-receptor.pdb"),
    ("4Y5U", "STAT6-4Y5U-observed-receptor.pdb"),
    ("8RQA", "CRBN-8RQA-observed-receptor.pdb"),
]:
    source = MMCIFParser(QUIET=True).get_structure(
        source_id, ROOT / "inputs" / (source_id + ".cif")
    )[0]["A"]
    derived = PDBParser(QUIET=True).get_structure(source_id, ROOT / "inputs" / derived_name)[0]["A"]
    for residue in derived:
        assert residue.id in source
        for atom in residue:
            assert atom.id in source[residue.id]
            assert np.allclose(atom.coord, source[residue.id][atom.id].coord, atol=0.001, rtol=0)
    report["reference_frames"].append(
        {
            "source": source_id,
            "derived": derived_name,
            "residues": len(list(derived)),
            "coordinates_preserved": True,
        }
    )

dictionary = MMCIF2Dict(ROOT / "inputs/9BIG.cif")
points = np.array(
    [
        [
            float(dictionary[column][i])
            for column in ["_atom_site.Cartn_x", "_atom_site.Cartn_y", "_atom_site.Cartn_z"]
        ]
        for i, comp in enumerate(dictionary["_atom_site.label_comp_id"])
        if comp == "A1AQQ" and dictionary["_atom_site.type_symbol"][i] != "H"
    ]
)
reference = Chem.SDMolSupplier(str(ROOT / "inputs/9BIG-AK1690-A701.sdf"), removeHs=False)[0]
assert reference is not None and len(points) > 20
for atom in reference.GetAtoms():
    if atom.GetAtomicNum() == 1:
        continue
    position = np.array(reference.GetConformer().GetAtomPosition(atom.GetIdx()))
    assert np.min(np.linalg.norm(points - position, axis=1)) < 0.002
assert Chem.MolToSmiles(Chem.RemoveHs(reference), isomericSmiles=False) != Chem.MolToSmiles(
    Chem.MolFromSmiles(manifest["molecules"][1]["original_smiles"]), isomericSmiles=False
)
report["pocket_reference"] = {
    "pdb": "9BIG",
    "ligand": "AK-1690",
    "same_coordinate_frame": True,
    "is_user_protac": False,
}
evidence = Path("server_tests/evidence/stat6")
evidence.mkdir(parents=True, exist_ok=True)
(evidence / "input-acceptance.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report))
