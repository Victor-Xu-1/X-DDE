"""Optional native writer-order metadata; never reinterpret experimental B-factors."""

import hashlib
import math
import re


def confidence_binding(path, full_bytes, data, atoms, token_count):
    """Keep unsupported historical outputs inspectable without inventing a mapping."""
    tokens = data.get("atom_to_token_idx")
    chains = data.get("token_asym_id")
    if (
        not re.search(r"_sample_\d+\.cif$", path.name)
        or not atoms
        or not isinstance(tokens, list)
        or len(tokens) != len(atoms)
        or not isinstance(chains, list)
        or len(chains) != token_count
        or any(type(i) is not int or not 0 <= i < token_count for i in tokens)
        or any(
            type(i) not in (int, float) or not math.isfinite(i) or i < 0 or i != int(i)
            for i in chains
        )
        or set(tokens) != set(range(token_count))
        or path.stat().st_size > 10_000_000
    ):
        return None
    structure = path.read_bytes()
    # This contract applies only to the paired full native CIF from the reviewed
    # dumper, not a filtered/PDB conversion or a file with experimental B-factors.
    if b"_predicted_by_opendde" not in structure[:512]:
        return None
    return {
        "protocol": "opendde-cif-row-v1",
        "structure_sha256": hashlib.sha256(structure).hexdigest(),
        "confidence_sha256": hashlib.sha256(full_bytes).hexdigest(),
        "atom_plddt": atoms,
        "atom_to_token_idx": tokens,
        "token_asym_id": chains,
    }
