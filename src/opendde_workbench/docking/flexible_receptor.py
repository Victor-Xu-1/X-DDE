"""One deterministic paired-output validator; never optimizes or aligns coordinates."""

import hashlib
import math
import re
from pathlib import Path

if __package__:
    from .receptor_atoms import BACKBONE, parse_atoms
    from .receptor_links import declared_links
    from .residue_geometry import SIDECHAIN_BONDS, geometry
else:  # The immutable scientific snapshot executes its native entrypoint directly.
    from receptor_atoms import BACKBONE, parse_atoms
    from receptor_links import declared_links
    from residue_geometry import SIDECHAIN_BONDS, geometry
METALS = frozenset(
    "LI NA K RB CS MG CA SR BA MN FE CO NI CU ZN CD HG AL CR MO W PT AU AG PD PB".split()
)


def validate_selection(atoms: dict, tokens: list[str], original: bytes = b"") -> None:
    if not 1 <= len(tokens) <= 8 or len(set(tokens)) != len(tokens):
        raise ValueError("Select one to eight distinct receptor residues.")
    declared_links(original, atoms, tokens, BACKBONE)
    metals = [a for a in atoms.values() if a.element in METALS]
    sulfur = [a for a in atoms.values() if a.residue == "CYS" and a.name == "SG"]
    for token in tokens:
        group = [a for a in atoms.values() if a.token == token]
        if not group or len({a.residue for a in group}) != 1:
            raise ValueError("A selected receptor residue is missing or ambiguous.")
        residue = group[0].residue
        expected = {"N", "CA", "C", "O"} | {
            name for edge in SIDECHAIN_BONDS.get(residue, "").split() for name in edge.split("-")
        }
        if residue not in SIDECHAIN_BONDS or any(a.record != "ATOM" for a in group):
            raise ValueError("Select a supported flexible standard amino-acid residue.")
        if {a.name for a in group} - {"OXT"} != expected:
            raise ValueError("A selected sidechain needs its complete original heavy-atom residue.")
        for atom in group:
            if (
                atom.name not in BACKBONE
                and atom.element in {"N", "O", "S"}
                and any(math.dist(atom.position, metal.position) <= 3 for metal in metals)
            ):
                raise ValueError("A selected sidechain is near a metal; use a specialized method.")
            if (
                atom.residue == "CYS"
                and atom.name == "SG"
                and any(
                    other.token != token and math.dist(atom.position, other.position) <= 2.5
                    for other in sulfur
                )
            ):
                raise ValueError("A selected cysteine may form a disulfide; keep it fixed.")
    geometry(atoms, atoms, tokens)


def normalize(original: bytes, raw: bytes, tokens: list[str], log: str, ligand: bytes):
    before = parse_atoms(original, reject_hydrogens=True)
    after = parse_atoms(raw)
    validate_selection(before, tokens, original)
    selection = re.findall(r"^Flexible residues:([^\r\n]*)", log, re.MULTILINE)
    if (
        len(selection) != 1
        or set(selection[0].split()) != set(tokens)
        or "Only identified" in log
        or "Removing non-flexible residue" in log
    ):
        raise ValueError("Native flexible residue selection differs from the declared selection.")
    if before.keys() != after.keys():
        raise ValueError("Native full receptor lost, added or renamed heavy atom identities.")
    lines = original.splitlines(keepends=True)
    fixed = backbone = maximum = 0.0
    moved = 0
    for key, atom in before.items():
        updated = after[key]
        if (atom.residue, atom.element) != (updated.residue, updated.element):
            raise ValueError("Native receptor changed atom or residue chemistry.")
        distance = math.dist(atom.position, updated.position)
        selected = atom.token in tokens and atom.name not in BACKBONE
        if atom.name in BACKBONE:
            backbone = max(backbone, distance)
        if not selected:
            fixed = max(fixed, distance)
            if distance > 0.002:
                raise ValueError("Native refinement moved a fixed/backbone/cofactor atom.")
        else:
            maximum = max(maximum, distance)
            moved += distance > 0.002
            coordinates = "".join(f"{v:8.3f}" for v in updated.position).encode()
            if len(coordinates) != 24:
                raise ValueError("Native coordinates cannot be represented in fixed-width PDB.")
            source = lines[atom.line]
            lines[atom.line] = source[:30] + coordinates + source[54:]
    normalized = b"".join(lines)
    checks = geometry(before, after, tokens)

    def digest(value):
        return hashlib.sha256(value).hexdigest()

    return normalized, {
        "method": "gnina_local_sidechains_v1",
        "residues": [
            {
                "chain": parts[0],
                "number": int(parts[1]),
                "insertion_code": parts[2] if len(parts) == 3 else "",
            }
            for parts in (token.split(":") for token in tokens)
        ],
        "input_receptor_artifact": "input-receptor.pdb",
        "raw_receptor_artifact": "native-flex-receptor.pdb",
        "raw_ligand_artifact": "poses.sdf",
        "original_receptor_sha256": digest(original),
        "raw_receptor_sha256": digest(raw),
        "receptor_sha256": digest(normalized),
        "raw_ligand_sha256": digest(ligand),
        "heavy_atom_count": len(before),
        "moved_sidechain_atoms": moved,
        "maximum_sidechain_displacement_angstrom": maximum,
        "native_fixed_max_displacement_angstrom": fixed,
        "native_backbone_max_displacement_angstrom": backbone,
        "convergence": "not_reported",
        **checks,
    }


def verify_pair(root: Path, source_sha: str, tokens: list[str], receipt: dict) -> None:
    def read(name):
        path = root / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 25 * 1024**2:
            raise ValueError("Paired refinement output is missing, unsafe or oversized.")
        return path.read_bytes()

    original, raw = read("input-receptor.pdb"), read("native-flex-receptor.pdb")
    if hashlib.sha256(original).hexdigest() != source_sha:
        raise ValueError("Paired refinement input differs from the exact original receptor.")
    normalized, actual = normalize(
        original, raw, tokens, read("native.log").decode(), read("poses.sdf")
    )
    if actual != receipt or normalized != read("receptor.pdb"):
        raise ValueError("Refinement receipt differs from the actual receptor/ligand pair.")
