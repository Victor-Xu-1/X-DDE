"""Bounded interactive derivatives of native atom/token confidence, preserving originals."""

import json
import math

from native_io import digest


def compact_confidence(source, destination):
    if source.stat().st_size > 512 * 1024**2:
        destination.write_text(
            json.dumps(
                {
                    "status": "download_only",
                    "reason": "native_confidence_above_interactive_budget",
                    "source_sha256": digest(source),
                }
            )
        )
        return
    value = json.loads(source.read_text())
    chains = value.get("token_asym_id")
    if not isinstance(chains, list) or not 1 <= len(chains) <= 10000:
        raise ValueError("Mol-1 token confidence lacks its native token identities.")
    count = len(chains)
    stride = max(1, math.ceil(count / 256))
    indices = list(range(0, count, stride))
    matrices = {}
    for key in ("token_pair_pae", "token_pair_pde", "contact_probs"):
        matrix = value.get(key)
        if (
            not isinstance(matrix, list)
            or len(matrix) != count
            or any(not isinstance(row, list) or len(row) != count for row in matrix)
        ):
            raise ValueError(
                "Mol-1 confidence matrix dimensions differ from the native token count."
            )
        if any(
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            or v < 0
            or key == "contact_probs"
            and v > 1
            for row in matrix
            for v in row
        ):
            raise ValueError("Mol-1 confidence matrix values or probability units are invalid.")
        matrices[key] = [[matrix[a][b] for b in indices] for a in indices]
    plddt, mapping = value.get("atom_plddt"), value.get("atom_to_token_idx")
    if (
        not isinstance(plddt, list)
        or not isinstance(mapping, list)
        or len(mapping) != len(plddt)
        or not plddt
    ):
        raise ValueError("Mol-1 atom confidence lacks its exact atom/token mapping.")
    if any(
        isinstance(v, bool)
        or not isinstance(v, (int, float))
        or not math.isfinite(v)
        or not 0 <= v <= 1
        for v in plddt
    ) or any(type(v) is not int or not 0 <= v < count for v in mapping):
        raise ValueError("Mol-1 atom confidence has an invalid scale or token mapping.")
    atom_stride = max(1, math.ceil(len(plddt) / 2000))
    atoms = list(range(0, len(plddt), atom_stride))
    destination.write_text(
        json.dumps(
            {
                "status": "available",
                "source_sha256": digest(source),
                "token_count": count,
                "token_stride": stride,
                "token_indices": indices,
                "token_asym_id": [chains[i] for i in indices],
                "matrices": matrices,
                "atom_count": len(plddt),
                "atom_stride": atom_stride,
                "atom_indices": atoms,
                "atom_plddt": [plddt[i] for i in atoms],
                "atom_to_token_idx": [mapping[i] for i in atoms],
                "atom_plddt_unit": "0-1",
                "axes": "native_zero_based_indices_not_residue_numbers",
            },
            allow_nan=False,
        )
    )
