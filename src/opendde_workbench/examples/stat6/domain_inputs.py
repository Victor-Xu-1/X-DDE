"""Reproducible SH2 inputs with exact native-MSA and predicted-reference parents."""

import hashlib
import json
import math
from uuid import UUID, uuid5

from ...alignment_files import read_alignment
from ...alignment_slice import a3m_bytes, slice_columns
from ...artifacts import contained
from ...research.contracts import VersionInput
from ..pins import ExamplePins
from .antibody_structure_input import AA
from .catalogue import verified_input

NAMESPACE = UUID("8c378778-5402-47b6-bf47-bf607981d139")
FIRST, LAST = 517, 632  # UniProt P42226 / PROSITE-ProRule PRU00191, inclusive.


def domain_coordinates(source, sequence):
    """Select the annotated interval without repairing, renumbering or refolding."""
    lines, residues = [], {}
    for line in source.splitlines(keepends=True):
        if not line.startswith(b"ATOM  ") or line[21:22] != b"A":
            continue
        number = int(line[22:26])
        if not FIRST <= number <= LAST:
            continue
        if line[16:17] != b" " or line[26:27] != b" ":
            raise ValueError("Resolve alternate or inserted identities before domain selection.")
        if AA.get(line[17:20].decode("ascii")) != sequence[number - FIRST]:
            raise ValueError("Predicted SH2 coordinates differ from the canonical sequence.")
        if not all(math.isfinite(float(line[i : i + 8])) for i in (30, 38, 46)):
            raise ValueError("Invalid predicted SH2 coordinates.")
        atom = line[12:16].strip()
        names = residues.setdefault(number, set())
        if atom in names:
            raise ValueError("Duplicate predicted SH2 atom identity.")
        names.add(atom)
        lines.append(line)
    if set(residues) != set(range(FIRST, LAST + 1)) or any(
        not {b"N", b"CA", b"C", b"O"} <= names for names in residues.values()
    ):
        raise ValueError("The predicted SH2 reference has incomplete backbone coverage.")
    return (
        b"REMARK 900 STAT6 P42226 SH2 517-632; ALPHAFOLD V6 PREDICTED REFERENCE\n"
        b"REMARK 900 ORIGINAL COORDINATES; NOT AN EXPERIMENTAL OR BINDING RESULT\n"
        + b"".join(lines)
        + b"TER\nEND\n"
    )


def reviewed_domain_inputs(scientific, records, canonical, structure_parent):
    """Prepare children only after verifying the retained, reviewed native search."""
    if records is None:
        return None
    pin = ExamplePins(scientific.store, records.settings.state_dir, modules=records.modules).get(
        "target-msa", verify=True
    )
    if pin is None or pin.review is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    if job.request.operation != "harness" or job.request.tool != "target-msa":
        raise ValueError("SH2 alignment preparation requires a reviewed native target search.")
    if job.request.payload.get("sequence") != canonical or len(canonical) != 847:
        raise ValueError("The reviewed target search differs from canonical STAT6.")
    output = records.settings.state_dir / "jobs" / str(pin.job_id) / "output"
    result = json.loads(contained(output, "result.json").read_text(encoding="utf-8"))
    native = result.get("result", {})
    path = contained(output, native.get("unpaired_msa_path", ""))
    rows = read_alignment(path, canonical)
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    manifest = [
        entry
        for entry in native.get("alignment_files", [])
        if entry.get("artifact") == path.relative_to(output).as_posix()
    ]
    if (
        len(manifest) != 1
        or any(
            manifest[0].get(key) != value
            for key, value in {
                "sha256": digest,
                "bytes": len(data),
                "rows": len(rows),
                "columns": len(canonical),
            }.items()
        )
        or native.get("sequence_sha256") != hashlib.sha256(canonical.encode()).hexdigest()
    ):
        raise ValueError("The retained native alignment differs from its complete manifest.")
    selected, excluded = slice_columns(
        rows, canonical, FIRST - 1, LAST, keep_leading_insertions=False
    )
    sequence = canonical[FIRST - 1 : LAST]
    scientific.validate_reference(structure_parent.reference)
    parent_asset = scientific.assets.get(structure_parent.reference.asset_id)
    source = scientific.assets.path(parent_asset).read_bytes()
    if source != verified_input("stat6_predicted_construct"):
        raise ValueError("SH2 coordinates require the exact documented AlphaFold reference.")
    provenance = {
        "canonical_range_inclusive": [FIRST, LAST],
        "alignment_job": str(pin.job_id),
        "alignment_artifact": path.relative_to(output).as_posix(),
        "alignment_sha256": digest,
        "source_rows": len(rows),
        "retained_rows": len(selected),
        "excluded_all_gap_rows": len(excluded),
        "structure_parent_sha256": parent_asset.sha256,
        "method": (
            "Select canonical SH2 match columns and internal insertions; discard flanking "
            "insertion overhangs. Preserve headers, duplicates and order. No search or inference."
        ),
        "scope": (
            "Isolated SH2 construct; predicted reference coordinates, not a full receptor, "
            "experimental binding pose or paired-chain MSA."
        ),
    }
    notes = json.dumps(provenance, sort_keys=True)

    def register(name, kind, content, label, *, parent=None, native_output=False):
        asset = scientific.assets.save(name, kind, content)
        return scientific.create(
            VersionInput(
                asset_id=asset.id,
                kind={"msa": "alignment", "sequences": "sequence", "structure": "structure"}[kind],
                label=label,
                parent_id=parent,
                relation="prepared_from",
                notes=notes,
            ),
            uuid5(NAMESPACE, name + ":" + asset.sha256 + ":" + str(parent) + ":" + notes),
            source_job=pin.job_id if kind == "msa" else None,
            validation="native_generated" if native_output else "file_integrity_only",
        )

    original = register(
        path.name, "msa", data, "STAT6 · Native target-search alignment", native_output=True
    )
    alignment = register(
        "STAT6-SH2-517-632-native-cropped.a3m",
        "msa",
        a3m_bytes(selected),
        "STAT6 · SH2 native-derived alignment",
        parent=original.id,
    )
    structure = register(
        "STAT6-SH2-517-632-AFv6-predicted.pdb",
        "structure",
        domain_coordinates(source, sequence),
        "STAT6 · SH2 predicted reference",
        parent=structure_parent.id,
    )
    seq = register(
        "STAT6-SH2-517-632.fasta",
        "sequences",
        f">STAT6|P42226|SH2|517-632\n{sequence}\n".encode(),
        "STAT6 · SH2 sequence",
    )
    return {
        "sequence": sequence,
        "objects": {
            "sh2_sequence": seq,
            "sh2_reference": structure,
            "sh2_msa_parent": original,
            "sh2_msa": alignment,
        },
        "provenance": provenance,
    }
