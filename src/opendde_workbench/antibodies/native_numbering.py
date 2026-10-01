"""Normalize actual ANARCII domains with original inclusive interval/IMGT residue identity."""

import hashlib
import math


def region(number):
    return (
        "CDR1"
        if 27 <= number <= 38
        else "CDR2"
        if 56 <= number <= 65
        else "CDR3"
        if 105 <= number <= 117
        else "framework"
    )


def normalize_domain(native, record, key, index, output):
    base = {
        "id": key,
        "source_id": record["id"],
        "available": False,
        "chain_type": native.get("chain_type"),
        "score": None,
        "start": None,
        "end": None,
        "sequence": None,
        "numbering": [],
        "artifact": None,
        "sha256": None,
        "reason": native.get("error"),
    }
    score = native.get("score")
    if score is not None:
        if not math.isfinite(float(score)):
            raise ValueError("Native antibody score is nonfinite.")
        base["score"] = float(score)
    numbering = native.get("numbering")
    if not numbering:
        base["reason"] = str(base["reason"] or "Native model did not number this sequence.")[:500]
        return base
    start, end = native.get("query_start"), native.get("query_end")
    if (
        isinstance(start, bool)
        or not isinstance(start, int)
        or isinstance(end, bool)
        or not isinstance(end, int)
        or not 0 <= start <= end < len(record["sequence"])
        or native.get("scheme") != "imgt"
        or native.get("chain_type") not in {"H", "K", "L"}
        or native.get("error")
    ):
        raise ValueError("Native antibody domain identity/interval/scheme is inconsistent.")
    sequence = "".join(aa for _, aa in numbering if aa != "-")
    if sequence != record["sequence"][start : end + 1]:
        raise ValueError("Numbered domain does not match the original inclusive sequence interval.")
    position = start
    rows = []
    identities = set()
    for (number, insertion), aa in numbering:
        if (
            isinstance(number, bool)
            or not isinstance(number, int)
            or not 1 <= number <= 128
            or not isinstance(insertion, str)
            or len(insertion.strip()) > 4
        ):
            raise ValueError("Native numbering address is invalid.")
        identity = (number, insertion.strip())
        if identity in identities:
            raise ValueError("Native antibody numbering duplicates an address.")
        identities.add(identity)
        if aa == "-":
            continue
        if not isinstance(aa, str) or len(aa) != 1 or aa != record["sequence"][position]:
            raise ValueError("Numbering residue identity changed.")
        rows.append(
            {
                "number": number,
                "insertion": insertion.strip(),
                "amino_acid": aa,
                "source_position": position + 1,
                "region": region(number),
            }
        )
        position += 1
    artifact = f"domain-{index:03d}.fasta"
    raw = (">" + key + "\n" + sequence + "\n").encode()
    (output / artifact).write_bytes(raw)
    base.update(
        available=True,
        start=start,
        end=end,
        sequence=sequence,
        numbering=rows,
        artifact=artifact,
        sha256=hashlib.sha256(raw).hexdigest(),
        reason=None,
    )
    return base
