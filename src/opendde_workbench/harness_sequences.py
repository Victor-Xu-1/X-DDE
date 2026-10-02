"""Bind exact FASTA sequence versions used by native Harness sequence tools."""


def used_sequences(request):
    payload = request.payload
    if request.tool == "esm":
        return payload.get("sequences", [])
    if request.tool in {"esm2", "mpnn"}:
        return list(payload.get("parent_chains", {}).values())
    if request.tool == "fold":
        return [
            sequence
            for candidate in payload.get("candidates", [])
            for sequence in candidate.get("chains", {}).values()
        ] + list(payload.get("options", {}).get("target_chains", {}).values())
    if request.tool in {"target-msa", "protrek-sequence"}:
        return [payload.get("sequence", "")]
    return []


def fasta_sequences(path):
    if path.suffix not in {".fasta", ".fa"} or path.stat().st_size > 200000:
        raise ValueError("Sequence provenance requires a bounded FASTA input.")
    records, current, seen_header = [], [], False
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith(">"):
            if seen_header and not current:
                raise ValueError("Sequence provenance contains an empty record.")
            if current:
                records.append("".join(current).upper())
            current = []
            seen_header = True
        elif line.strip():
            if not seen_header:
                raise ValueError("Sequence provenance requires FASTA headers.")
            current.append(line.strip())
    if seen_header and not current:
        raise ValueError("Sequence provenance contains an empty record.")
    if current:
        records.append("".join(current).upper())
    if not records or any(not sequence or len(sequence) > 10000 for sequence in records):
        raise ValueError("Sequence provenance contains an empty or oversized sequence.")
    return records


def sequence_bindings(request, assets):
    sequences = used_sequences(request)
    result = {}
    for ref in request.scientific_inputs:
        asset = assets.get(ref.asset_id)
        if asset.kind != "sequences":
            continue
        if ref.record or ref.conformer:
            raise ValueError("Harness sequence provenance refers to the complete FASTA input.")
        source = fasta_sequences(assets.path(asset))
        if any(sequence not in sequences for sequence in source):
            raise ValueError("Sequence differs from its scientific source; save a new version.")
        result[asset.id] = asset
    return result
