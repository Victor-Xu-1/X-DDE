"""Verify exact source bytes, complete native rows and candidate bytes before indexing."""

import hashlib

from ..antibodies.fasta import read_fasta
from ..artifacts import contained
from .result_models import HumanizationResult
from .result_validation import row_evidence


def validate_humanization(value, task, output):
    result = HumanizationResult.model_validate(value)
    if result.source != task.sequences or result.options != task.options:
        raise ValueError("Sequence evaluation differs from the exact selected input or options.")
    base = output.parent / "assets"
    sources = [
        contained(base, str(task.sequences.asset_id) + suffix)
        for suffix in (".fa", ".fasta")
        if (base / (str(task.sequences.asset_id) + suffix)).exists()
    ]
    if len(sources) != 1 or sources[0].stat().st_size > 2 * 1024**2:
        raise ValueError("The exact bounded source FASTA snapshot is missing or ambiguous.")
    raw = sources[0].read_bytes()
    if hashlib.sha256(raw).hexdigest() != task.sequences.sha256:
        raise ValueError("The original sequence source bytes changed.")
    records = read_fasta(raw)
    if len(records) != len(result.rows):
        raise ValueError("Native evaluation omitted or invented original sequence records.")
    for index, (record, row) in enumerate(zip(records, result.rows, strict=True)):
        if (
            row.record != index
            or row.source_id != record["id"]
            or row.source_sequence != record["sequence"]
        ):
            raise ValueError("Native evaluation reordered or changed original sequences.")
        row_evidence(row, task.options)
        if row.artifact:
            name = f"humanized-{index + 1:03d}.fasta"
            expected = (f">humanized-{index + 1:03d}\n" + row.proposal + "\n").encode()
            file = contained(output, name)
            if (
                row.artifact != name
                or file.stat().st_size > 1024
                or file.read_bytes() != expected
                or row.artifact_sha256 != hashlib.sha256(expected).hexdigest()
            ):
                raise ValueError("The humanized candidate differs from its actual native proposal.")
    return result
