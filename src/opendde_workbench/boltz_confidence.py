"""Read-only native Boltz confidence preview; no inference or file mutation."""

import hashlib
import json
import math

from .boltz_confidence_mapping import atom_tokens
from .boltz_confidence_sources import boltz_sources
from .native_arrays import floats, read_array


def boltz_confidence_view(root, request, candidate, metric, request_sha256, sealed=None, bins=200):
    if metric not in ("pae", "pde") or not 1 <= bins <= 256:
        raise ValueError("This native prediction provides PAE and PDE confidence views.")
    source = boltz_sources(root, request, candidate, request_sha256, sealed)
    raw = source["bytes"].get(metric)
    if raw is None:
        raise FileNotFoundError("The selected native confidence matrix was not retained.")
    matrix = read_array(raw, metric)
    if len(matrix.shape) != 2 or not 0 < matrix.shape[0] == matrix.shape[1] <= 10000:
        raise ValueError("Native Boltz confidence matrix is not square.")
    count = matrix.shape[0]
    matrix_at = floats(matrix)
    stride = max(1, math.ceil(count / bins))
    indices = list(range(0, count, stride))
    binding, token_values = None, []
    mapping_status = "not_retained"
    if "plddt" in source["bytes"]:
        plddt = read_array(source["bytes"]["plddt"], "plddt")
        if plddt.shape != (count,):
            raise ValueError("Native Boltz token confidence has an inconsistent shape.")
        plddt_at = floats(plddt)
        values = [plddt_at(index) for index in range(count)]
        if any(value > 1 for value in values):
            raise ValueError("Native Boltz pLDDT requires the 0–1 scale.")
        token_values = [{"index": index, "value": values[index]} for index in indices]
        if "mapping" in source["bytes"]:
            try:
                identities, links, chains = atom_tokens(source["bytes"]["mapping"], count)
            except (ValueError, TypeError, KeyError):
                # Valid numerical output remains inspectable; unsupported identities
                # explicitly disable structural linkage instead of guessing a map.
                mapping_status = "unsupported"
            else:
                mapping_status = "available"
                binding = {
                    "protocol": "boltz-2.2.1-cif-row-v1",
                    "structure_sha256": source["structure_sha256"],
                    "confidence_sha256": hashlib.sha256(
                        json.dumps(source["hashes"], sort_keys=True).encode()
                    ).hexdigest(),
                    "atom_plddt": [values[index] for index in links],
                    "atom_to_token_idx": links,
                    "token_asym_id": chains,
                    "native_atom_identity": identities,
                }
    return {
        "metric": metric,
        "field": metric,
        "token_count": count,
        "indices": indices,
        "stride": stride,
        "matrix": [[matrix_at(row, column) for column in indices] for row in indices],
        "atom_plddt": [],
        "atom_stride": 1,
        "atom_plddt_unit": "0-1",
        "token_plddt": token_values,
        "token_plddt_unit": "0-1",
        "native_artifact": source["names"][metric],
        "native_sha256": source["hashes"][metric],
        "source_integrity": source["source_integrity"],
        "mapping_status": mapping_status,
        "structure_artifact": source["structure_artifact"],
        "binding": binding,
    }
