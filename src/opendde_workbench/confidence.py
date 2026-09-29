"""Bounded views of native confidence arrays, with explicit subsampling metadata."""

import json
import math

from .artifacts import contained


def confidence_view(root, artifact, metric, bins=200):
    path = contained(root, artifact)
    name = path.name.replace("_sample_", "_full_data_sample_")
    full = contained(root, path.with_name(name).with_suffix(".json").relative_to(root).as_posix())
    if full.stat().st_size > 64 * 1024**2:
        raise ValueError(
            "Confidence data exceeds the64MiB interactive limit; download the native file."
        )
    data = json.loads(full.read_text())
    field = {"pae": "token_pair_pae", "pde": "token_pair_pde", "contacts": "contact_probs"}[metric]
    matrix = data.get(field)
    if not isinstance(matrix, list) or not matrix or len(matrix) > 10000:
        raise ValueError("Requested native confidence matrix is unavailable.")
    count = len(matrix)
    stride = max(1, math.ceil(count / bins))
    indices = list(range(0, count, stride))
    result = []
    for i in indices:
        if not isinstance(matrix[i], list) or len(matrix[i]) != count:
            raise ValueError("Native confidence matrix has an invalid shape.")
        row = [matrix[i][j] for j in indices]
        if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in row):
            raise ValueError("Native confidence matrix contains non-finite values.")
        result.append(row)
    atoms = data.get("atom_plddt", [])
    if not isinstance(atoms, list) or len(atoms) > 100000:
        raise ValueError("Native atom confidence has an invalid shape.")
    atom_stride = max(1, math.ceil(len(atoms) / 1000))
    atom_values = []
    for i in range(0, len(atoms), atom_stride):
        value = atoms[i]
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("Native atom confidence contains non-finite values.")
        atom_values.append({"index": i, "value": value})
    return {
        "metric": metric,
        "field": field,
        "token_count": count,
        "indices": indices,
        "stride": stride,
        "matrix": result,
        "atom_plddt": atom_values,
        "atom_stride": atom_stride,
        "native_artifact": full.relative_to(root).as_posix(),
    }
