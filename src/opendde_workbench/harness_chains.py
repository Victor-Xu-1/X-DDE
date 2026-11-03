"""Read pinned native fold-chain inputs without modifying requests or loading models."""

from collections.abc import Mapping


def native_chain_sequences(chains):
    """Keep invalid chain identities visible; never coerce non-sequence data to text."""
    if not isinstance(chains, Mapping):
        return {}
    return {
        chain: sequence if isinstance(sequence, str) else None
        for chain, value in chains.items()
        for sequence in [value.get("sequence") if isinstance(value, Mapping) else value]
    }


def fold_chains(payload):
    """Follow reviewed Harness 0.0.4 target/binder merges for source validation only."""
    options = payload.get("options") or {}
    binder_options = options.get("binder_chain_options") or {}
    for candidate in payload.get("candidates", []):
        merged = dict(options.get("target_chains") or {})
        chains = candidate.get("chains")
        if not isinstance(chains, Mapping) or not chains:
            metadata = candidate.get("metadata") or {}
            chains = metadata.get("chains") if isinstance(metadata, Mapping) else None
        if not isinstance(chains, Mapping) or not chains:
            identifiers = options.get("binder_chain_ids") or []
            if len(identifiers) > 1:
                raise ValueError("A multichain fold requires explicit binder sequences.")
            identifier = str(identifiers[0] if identifiers else options.get("binder_chain", "D"))
            chains = {identifier: candidate.get("sequence")}
        for chain, value in chains.items():
            key = str(chain)
            template = binder_options.get(key) if isinstance(binder_options, Mapping) else None
            merged[key] = (
                {**template, "sequence": native_chain_sequences({key: value})[key]}
                if isinstance(template, Mapping)
                else value
            )
        yield merged
