"""A coordinate-preserving VH reference for the antibody-domain search adapter."""

import hashlib
import json
import math
from uuid import UUID, uuid5

from ...research.contracts import VersionInput
from .catalogue import verified_input

NAMESPACE = UUID("de4f370b-c504-46ad-a905-1e3b16434ef2")
AA = dict(
    zip(
        "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL".split(),
        "ARNDCQEGHILKMFPSTWYV",
        strict=True,
    )
)


def variable_domain_atoms(data, sequence, chain):
    """Validate an exact deposited sequence prefix in observed residue order."""
    if not sequence or chain not in {"A", "B"}:
        raise ValueError("Select a named deposited heavy or light variable domain.")
    selected, residues = [], {}
    for line in data.splitlines(keepends=True):
        if not line.startswith(b"ATOM  ") or line[21:22] != chain.encode("ascii"):
            continue
        number = int(line[22:26])
        if not 1 <= number <= len(sequence):
            continue
        if len(line) < 54 or line[16:17] != b" " or line[26:27] != b" ":
            raise ValueError(
                "Resolve alternate or inserted residue identities before domain selection."
            )
        if AA.get(line[17:20].decode("ascii")) != sequence[number - 1]:
            raise ValueError(
                "Deposited variable-domain coordinates differ from the reviewed sequence."
            )
        if not all(math.isfinite(float(line[start : start + 8])) for start in (30, 38, 46)):
            raise ValueError("Invalid variable-domain coordinates.")
        atom = line[12:16].strip()
        if number not in residues and number != len(residues) + 1:
            raise ValueError("Deposited variable-domain residue order changed.")
        names = residues.setdefault(number, set())
        if atom in names:
            raise ValueError("Duplicate variable-domain atom identity.")
        names.add(atom)
        selected.append(line)
    if set(residues) != set(range(1, len(sequence) + 1)) or any(
        not {b"N", b"CA", b"C", b"O"} <= names for names in residues.values()
    ):
        raise ValueError("The deposited variable domain has incomplete backbone coverage.")
    return b"".join(selected)


def variable_domain_pdb(data, sequence):
    """Select deposited A1..125; no inference, renumbering or atom repair."""
    if len(sequence) != 125:
        raise ValueError("Use the reviewed 125-residue deposited heavy variable domain.")
    selected = variable_domain_atoms(data, sequence, "A")
    header = (
        b"REMARK 900 6WGL HEAVY VARIABLE DOMAIN A1-125; ORIGINAL COORDINATES\n"
        b"REMARK 900 IL-4R ALPHA / STAT6 PATHWAY; NOT A DIRECT STAT6 ANTIBODY\n"
    )
    return header + selected + b"TER\nEND\n"


def reviewed_antibody_structure(scientific, parent):
    """Publish an edited reference version under the existing scientific authority."""
    scientific.validate_reference(parent.reference)
    asset = scientific.assets.get(parent.reference.asset_id)
    source = scientific.assets.path(asset).read_bytes()
    if source != verified_input("dupilumab_complex"):
        raise ValueError("The domain requires the exact deposited 6WGL reference.")
    sequence = "".join(verified_input("dupilumab_heavy").decode("ascii").splitlines()[1:])
    data = variable_domain_pdb(source, sequence)
    child = scientific.assets.save("6WGL-heavy-variable-A1-125.pdb", "structure", data)
    notes = json.dumps(
        {
            "reference_pdb": "6WGL",
            "source_sha256": asset.sha256,
            "author_chain": "A",
            "author_residues": [1, 125],
            "sequence_sha256": hashlib.sha256(sequence.encode()).hexdigest(),
            "scope": (
                "Coordinate selection from the deposited STAT6-pathway Fab; "
                "no new folding, antibody activity or target binding claim."
            ),
        },
        sort_keys=True,
    )
    key = uuid5(NAMESPACE, str(parent.id) + ":" + child.sha256 + ":" + notes)
    return scientific.create(
        VersionInput(
            asset_id=child.id,
            kind="structure",
            label="STAT6 pathway · 6WGL heavy variable domain A1-125",
            parent_id=parent.id,
            relation="prepared_from",
            notes=notes,
        ),
        key,
        validation="file_integrity_only",
    )
