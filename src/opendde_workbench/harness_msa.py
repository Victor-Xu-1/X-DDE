"""Bind per-chain native A3M files to their exact query before scientific admission."""

from collections.abc import Mapping

from .alignment_files import read_alignment
from .harness_chains import fold_chains

FIELDS = ("unpairedMsaPath", "pairedMsaPath")


def msa_bindings(request, assets):
    if request.tool != "fold":
        return {}
    result, checked = {}, set()
    for chains in fold_chains(request.payload):
        for chain, value in chains.items():
            if not isinstance(value, Mapping):
                continue
            if any(value.get(key) for key in ("unpaired_msa_path", "paired_msa_path")):
                raise ValueError(
                    "Native fold chains use unpairedMsaPath and pairedMsaPath asset fields."
                )
            for field in FIELDS:
                token = value.get(field)
                if not token:
                    continue
                if not isinstance(token, str) or not token.startswith("asset:"):
                    raise ValueError("Each native fold MSA field requires one selected asset.")
                asset = assets.get(token.removeprefix("asset:"))
                if asset.kind != "msa" or asset.suffix != ".a3m":
                    raise ValueError("Native fold chains require complete A3M alignment files.")
                sequence = value.get("sequence")
                if not isinstance(sequence, str) or not sequence:
                    raise ValueError("An MSA-bound fold chain requires an explicit sequence.")
                identity = (asset.id, asset.sha256, sequence)
                if identity not in checked:
                    try:
                        read_alignment(assets.path(asset), sequence)
                    except ValueError as error:
                        raise ValueError(
                            f"Fold chain {chain} MSA differs from its sequence: {error}"
                        ) from error
                    checked.add(identity)
                result[asset.id] = asset
    return result
