"""Pinned public control and independent structural correspondence for method review."""

import hashlib
import json
import urllib.request
import zipfile
from io import BytesIO
from pathlib import PurePosixPath

import numpy as np
from rdkit import Chem
from scipy.spatial import cKDTree

COMMIT = "0be091b02f72ca69b4c8fefb61d2e7126521198d"
ARCHIVE = "5500895de291608419c2f48cb114e3463c49226bd6c9e5e158162f0353dcd914"
INPUTS = ("e3.pdb", "e3.sdf", "poi.pdb", "poi.sdf", "protac.sdf", "tcs.inp")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def restore(root):
    url = f"https://codeload.github.com/WIMNZhao/TERNIFY/zip/{COMMIT}"
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(20 * 1024**2 + 1)
    if len(data) > 20 * 1024**2 or hashlib.sha256(data).hexdigest() != ARCHIVE:
        raise ValueError("The official immutable source archive changed.")
    (root / "source.zip").write_bytes(data)
    prefix = f"TERNIFY-{COMMIT}/"
    with zipfile.ZipFile(BytesIO(data)) as archive:
        for member in archive.infolist():
            relative = member.filename.removeprefix(prefix)
            path = PurePosixPath(relative)
            selected = relative.startswith("src/") or relative in {
                "LICENSE",
                "README.md",
                "requirements.txt",
                *("data/6hr2/" + name for name in INPUTS),
            }
            if not selected or member.is_dir():
                continue
            if (
                not member.filename.startswith(prefix)
                or path.is_absolute()
                or ".." in path.parts
                or member.file_size > 5 * 1024**2
                or member.external_attr >> 16 & 0o170000 == 0o120000
            ):
                raise ValueError("Unsafe or oversized native control source member.")
            target = root.joinpath("source", *path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(member))
    control = root / "source/data/6hr2"
    return control, {name: digest(control / name) for name in INPUTS}


def pdb_atoms(path, *, native_subset=False, lines=None):
    rows = []
    for line in path.read_text().splitlines() if lines is None else lines:
        if line.startswith("END"):
            break
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        if native_subset and (
            not line.startswith("ATOM  ") or line[13] == "H" or line[16] not in " A"
        ):
            continue
        rows.append((line[:30], [float(line[i : i + 8]) for i in (30, 38, 46)]))
    if not rows:
        raise ValueError("The native control contains no supported protein coordinates.")
    return [key for key, _ in rows], np.array([xyz for _, xyz in rows])


def protein_models(path):
    models, current = [], None
    for line in path.read_text().splitlines():
        if line.startswith("MODEL"):
            if current is not None:
                raise ValueError("Nested native protein models are invalid.")
            current = []
        elif line.startswith("ENDMDL"):
            if not current:
                raise ValueError("Empty native protein models are invalid.")
            models.append(current)
            current = None
        elif current is not None:
            current.append(line)
        elif line.startswith(("ATOM", "HETATM")):
            raise ValueError("Unbound native protein records are invalid.")
    if current is not None:
        raise ValueError("The native protein model was not completed.")
    return models


def inspect_record(control, source, molecule, model):
    def identity(molecule):
        return Chem.MolToSmiles(Chem.RemoveHs(molecule), isomericSmiles=True)

    if identity(source) != identity(molecule):
        raise ValueError("The native control changed the full molecular graph or stereochemistry.")
    expected = {
        a.GetIdx(): a.GetProp("_CIPCode") for a in source.GetAtoms() if a.HasProp("_CIPCode")
    }
    physical = Chem.Mol(molecule)
    Chem.RemoveStereochemistry(physical)
    Chem.AssignStereochemistryFrom3D(physical, replaceExistingTags=True)
    Chem.AssignStereochemistry(physical, cleanIt=True, force=True)
    if any(
        not physical.GetAtomWithIdx(i).HasProp("_CIPCode")
        or physical.GetAtomWithIdx(i).GetProp("_CIPCode") != value
        for i, value in expected.items()
    ):
        raise ValueError("The native physical conformer changed known input stereochemistry.")
    positions = molecule.GetConformer().GetPositions()
    score = float(molecule.GetProp("score"))
    if not np.isfinite(positions).all() or not np.isfinite(score):
        raise ValueError("The native control returned non-finite geometry or score.")
    names, original = pdb_atoms(control / "poi.pdb", native_subset=True)
    output_names, transformed = pdb_atoms(None, native_subset=True, lines=model)
    if names != output_names:
        raise ValueError("The native moving protein changed its source atom correspondence.")
    left, right = original.mean(axis=0), transformed.mean(axis=0)
    u, _, vh = np.linalg.svd((original - left).T @ (transformed - right))
    rotation = u @ np.diag([1, 1, np.linalg.det(u @ vh)]) @ vh
    restored = (original - left) @ rotation + right
    rmsd = float(np.sqrt(np.mean(np.sum((restored - transformed) ** 2, axis=1))))
    if abs(np.linalg.det(rotation) - 1) > 1e-6 or rmsd > 0.003:
        raise ValueError("The moving protein is not one proper rigid source transform.")
    _, complete = pdb_atoms(control / "poi.pdb")
    complete = (complete - left) @ rotation + right
    _, anchor = pdb_atoms(control / "e3.pdb")
    contacts = cKDTree(anchor).query_ball_tree(cKDTree(complete), 1.2)
    signature = hashlib.sha256(
        positions.tobytes() + transformed.tobytes() + str(score).encode()
    ).hexdigest()
    return {
        "full_graph_and_stereo_preserved": True,
        "physical_known_CIP_centres_checked": len(expected),
        "moving_protein_atoms": len(names),
        "proper_rigid_transform_rmsd_A": rmsd,
        "observed_context_pairs_below_1_2_A": sum(map(len, contacts)),
        "native_score": score,
        "score_interpretation": "Native mixed-term score; not binding affinity or cooperativity.",
        "scientific_accuracy_accepted": False,
        "coordinate_score_signature": signature,
    }


def inspect_output(control):
    source = next(m for m in Chem.SDMolSupplier(str(control / "protac.sdf")) if m)
    generated = [m for m in Chem.SDMolSupplier(str(control / "TC_protac.sdf")) if m]
    models = protein_models(control / "TC_protein.pdb")
    if len(generated) != len(models) or len(generated) != 3:
        raise ValueError("All three declared native controls must have matching complete outputs.")
    rows = [
        inspect_record(control, source, molecule, model)
        for molecule, model in zip(generated, models, strict=True)
    ]
    if rows[0]["coordinate_score_signature"] != rows[1]["coordinate_score_signature"]:
        raise ValueError("Equal native worker seeds did not reproduce their final structures.")
    return {
        "native_molecules": len(rows),
        "records": rows,
        "equal_root_seed_reproduced": True,
        "changed_seed_same_final_geometry": rows[0]["coordinate_score_signature"]
        == rows[2]["coordinate_score_signature"],
        "scientific_accuracy_accepted": False,
    }


def write_report(path, value):
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")
