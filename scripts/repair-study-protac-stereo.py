"""Version the study input's stereo annotation; never regenerate or move coordinates."""

import hashlib
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
from rdkit import Chem, rdBase

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench/examples/stat6"
spec = importlib.util.spec_from_file_location(
    "study_molfile_stereo", ROOT.parent.parent / "chemistry/molfile_stereo.py"
)
serializer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serializer)
source_stereo_molecule = serializer.source_stereo_molecule
manifest_path = ROOT / "manifest.json"
baseline_revision = json.loads(manifest_path.read_text(encoding="utf-8"))["case"]["revision"]
assert baseline_revision in {1, 2}
archive = ROOT / "manifest-v1.json"
if not archive.exists():
    with archive.open("xb") as output:
        output.write(manifest_path.read_bytes())
original = json.loads(archive.read_text(encoding="utf-8"))
assert original["case"]["revision"] == 1
item = next(row for row in original["molecules"] if row["name"] == "STAT6-user-PROTAC")
assert rdBase.rdkitVersion == item["rdkit"]
source_file = ROOT / "inputs" / item["file"]
raw = source_file.read_bytes()
assert hashlib.sha256(raw).hexdigest() == item["sha256"]
old = Chem.SDMolSupplier(str(source_file), removeHs=False)[0]
expected = Chem.MolFromSmiles(item["original_smiles"])
assert old is not None and expected is not None
assert [atom.GetAtomicNum() for atom in list(old.GetAtoms())[: expected.GetNumAtoms()]] == [
    atom.GetAtomicNum() for atom in expected.GetAtoms()
]
unknown = [
    info.centeredOn
    for info in Chem.FindPotentialStereo(expected)
    if info.type == Chem.StereoType.Atom_Tetrahedral
    and info.specified != Chem.StereoSpecified.Specified
]
assert unknown == item["undefined_stereocenters"]
corrected = Chem.Mol(old)
for index in unknown:
    atom = corrected.GetAtomWithIdx(index)
    atom.SetChiralTag(Chem.ChiralType.CHI_UNSPECIFIED)
    if atom.HasProp("_CIPCode"):
        atom.ClearProp("_CIPCode")
corrected = source_stereo_molecule(corrected)
corrected.SetProp(
    "X-DDE source stereo", "Unspecified source centres retained; one calculated unbound conformer"
)
buffer = io.StringIO()
writer = Chem.SDWriter(buffer)
writer.write(corrected)
writer.flush()
content = buffer.getvalue().encode()
supplier = Chem.SDMolSupplier()
supplier.SetData(content.decode(), removeHs=False)
restored = supplier[0]
assert restored is not None
clean = Chem.Mol(restored)
for atom in clean.GetAtoms():
    atom.SetAtomMapNum(0)
assert Chem.MolToSmiles(Chem.RemoveHs(clean), isomericSmiles=True) == Chem.MolToSmiles(
    expected, isomericSmiles=True
)
assert np.array_equal(old.GetConformer().GetPositions(), restored.GetConformer().GetPositions())
name = "STAT6-user-PROTAC-stereo-uncertainty-v2.sdf"
target = ROOT / "inputs" / name
if target.exists():
    assert target.read_bytes() == content
else:
    with target.open("xb") as output:
        output.write(content)
digest = hashlib.sha256(content).hexdigest()
current = json.loads(json.dumps(original))
current["case"]["revision"] = 2
url = "https://github.com/Victor-Xu-1/X-DDE/releases/download/examples-stat6-stereo-v2/" + name
current["files"]["study_protac"].update(name=name, url=url, sha256=digest, bytes=len(content))
current_item = next(row for row in current["molecules"] if row["name"] == item["name"])
current_item.update(file=name, sha256=digest, bytes=len(content))
proof = {
    "method": "Molfile stereo annotation correction only",
    "source_file": item["file"],
    "source_sha256": item["sha256"],
    "derived_file": name,
    "derived_sha256": digest,
    "source_original_smiles": item["original_smiles"],
    "source_undefined_stereocenters": unknown,
    "atom_order_preserved": True,
    "all_coordinates_preserved_exactly": True,
    "new_geometry_or_energy_calculations": 0,
    "rdkit": rdBase.rdkitVersion,
    "historical_manifest": archive.name,
    "historical_manifest_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "standard_reference": "https://www.rdkit.org/docs/RDKit_Book.html#sources-of-information-about-stereochemistry",
}
current["source_corrections"] = [proof]
proof_file = ROOT / "inputs/STAT6-user-PROTAC-stereo-v2.provenance.json"
encoded = (json.dumps(proof, ensure_ascii=False, indent=2) + "\n").encode()
if proof_file.exists():
    assert proof_file.read_bytes() == encoded
else:
    with proof_file.open("xb") as output:
        output.write(encoded)
profiles_path = ROOT / "catalogue-profiles.json"
profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
if baseline_revision == 1:
    for profile in profiles.values():
        profile.setdefault("manifest_file", archive.name)
        profile.setdefault("manifest_sha256", proof["historical_manifest_sha256"])
profiles_path.write_text(
    json.dumps(profiles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
manifest_path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
assert source_file.read_bytes() == raw
print(json.dumps(proof))
