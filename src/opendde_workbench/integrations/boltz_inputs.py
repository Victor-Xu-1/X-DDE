"""Exact per-protein MSA and molecular references in the existing task envelope."""

import hashlib

from ..alignment_files import read_alignment


def validate_input_contract(task):
    components = task.payload.components
    ligand = [component.source for component in components if component.source]
    if len(ligand) > 1:
        raise ValueError("Choose at most one exact ligand file.")
    expected = {
        (role, reference)
        for role, references in (
            ("ligand", ligand),
            ("msa", [component.msa for component in components if component.msa]),
        )
        for reference in references
    }
    actual = [(item.role, item.source) for item in task.inputs]
    if len(set(actual)) != len(actual) or set(actual) != expected:
        raise ValueError("Confirm each exact ligand and MSA file once in the task inputs.")
    identical = {}
    for component in components:
        if (component.source and (component.kind != "ligand" or component.value)) or (
            not component.source and not component.value
        ):
            raise ValueError("Choose either a ligand file or text for each component.")
        if component.msa and (
            component.kind != "protein" or component.msa.record or component.msa.conformer
        ):
            raise ValueError("An MSA belongs to a complete protein alignment, not a molecule.")
        if component.msa_mode is not None and (
            component.kind != "protein" or (component.msa_mode == "provided") != bool(component.msa)
        ):
            raise ValueError(
                "Confirm a protein MSA file or explicitly choose single-sequence mode."
            )
        if component.kind == "protein":
            if component.value in identical and identical[component.value] != component.msa:
                raise ValueError("Identical protein sequences must use the same MSA.")
            identical[component.value] = component.msa


def checked_msa(reference, sequence, assets):
    asset = assets.get(reference.asset_id)
    if (
        asset.kind != "msa"
        or asset.suffix not in {".a3m", ".csv"}
        or asset.sha256 != reference.sha256
    ):
        raise ValueError("Choose a supported protein MSA file.")
    if reference.version_id:
        from ..research.storage import ScientificStore

        ScientificStore(assets.store, assets).validate_reference(reference)
    path = assets.path(asset)
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != reference.sha256:
            raise ValueError("The selected MSA bytes differ from their scientific reference.")
    rows = read_alignment(path, sequence)
    return {
        "rows": len(rows),
        "unique_sequences": len({row.replace("-", "").upper() for _, row in rows}),
        "columns": len(sequence),
        "name": asset.name,
    }
