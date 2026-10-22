"""Validated, offline per-chain MSA transport into the official Boltz schema."""

from pathlib import Path

from native_alignment_files import read_alignment, write_alignment
from native_io import input_file


def protein_msa(request, component, directory):
    reference = component.get("msa")
    if reference is None:
        return "empty"
    selected = [
        item for item in request["inputs"] if item["role"] == "msa" and item["source"] == reference
    ]
    if len(selected) != 1:
        raise ValueError("This protein has no unique, exact native MSA binding.")
    source, _ = input_file({"inputs": selected}, "msa")
    rows = read_alignment(source, component["value"])
    directory = Path(directory)
    directory.mkdir(exist_ok=True, parents=True)
    # Boltz requires identical protein sequences to share the same MSA path.
    target = directory / ("msa-" + reference["sha256"] + source.suffix)
    write_alignment(rows, target)
    return str(target)
