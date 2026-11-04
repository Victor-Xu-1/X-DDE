"""Prepare a local read-only view of exact native fold sources."""

from collections.abc import Mapping

from .harness_chains import fold_chain_groups, native_chain_sequences
from .harness_tools import asset_references

_CHAIN_FILES = {
    "unpairedMsaPath": "unpaired",
    "pairedMsaPath": "paired",
    "templatesPath": "template",
}


def _chains(values, bindings):
    result = []
    for chain, sequence in native_chain_sequences(values).items():
        if not isinstance(sequence, str) or not sequence.strip():
            raise ValueError("Each reviewed chain requires a sequence.")
        raw = values[chain]
        files = []
        if isinstance(raw, Mapping):
            for field, role in _CHAIN_FILES.items():
                tokens = raw.get(field) or []
                if isinstance(tokens, str):
                    tokens = [tokens]
                for token in tokens:
                    asset = bindings[token.removeprefix("asset:")]
                    files.append({"id": asset.id, "name": asset.name, "role": role})
        result.append({"chain": str(chain), "sequence": sequence, "files": files})
    return result


def review_fold(task, assets):
    candidates = task.payload.get("candidates")
    options = task.payload.get("options")
    if (
        not isinstance(options, dict)
        or not isinstance(options.get("target_chains"), dict)
        or not options["target_chains"]
        or not isinstance(candidates, list)
        or not 1 <= len(candidates) <= 64
        or any(not isinstance(row, dict) or not row.get("candidate_id") for row in candidates)
    ):
        raise ValueError("Provide target chains and one to sixty-four named candidates.")
    if any(
        options.get(key) is not None and not isinstance(options[key], kind)
        for key, kind in (("binder_chain_options", dict), ("binder_chain_ids", list))
    ):
        raise ValueError("Invalid binder chain options.")
    identifiers = set()
    for _, identifier in asset_references(task.payload):
        identifiers.add(identifier)
        if len(identifiers) > 64:
            raise ValueError("Use at most 64 input files.")
    bindings = assets.validate_bindings(task)
    reviewed = []
    for candidate, (target, binder) in zip(
        candidates, fold_chain_groups(task.payload), strict=True
    ):
        reviewed.append(
            {
                "name": candidate["candidate_id"],
                "chains": _chains(binder, bindings),
                "replaced_target_chains": [chain for chain in target if chain in binder],
            }
        )
    return {
        "target": _chains(options["target_chains"], bindings),
        "candidates": reviewed,
        "source_files": [{"id": asset.id, "name": asset.name} for asset in bindings.values()],
    }
