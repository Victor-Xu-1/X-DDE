"""Single bounded FASTA parser shared by input boundary, native runner and evidence validation."""

import re


def read_fasta(raw):
    if not raw or len(raw) > 2 * 1024**2 or b"\x00" in raw:
        raise ValueError("Provide a nonempty UTF-8 FASTA collection no larger than 2 MiB.")
    records = []
    identifier = None
    sequence = []

    def save():
        if identifier is None:
            return
        value = "".join(sequence).upper()
        if not re.fullmatch(r"[ACDEFGHIKLMNPQRSTVWYX]{20,2000}", value):
            raise ValueError("Each antibody input requires 20 to 2000 supported amino acids.")
        records.append({"id": identifier, "sequence": value})
        if len(records) > 50:
            raise ValueError("Choose at most 50 antibody sequence records per task.")

    for line in raw.decode("utf-8-sig").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            save()
            identifier = line[1:].split()[0] if line[1:].strip() else ""
            if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", identifier):
                raise ValueError(
                    "Use unique FASTA identifiers with letters, digits, dot, dash or underscore."
                )
            sequence = []
        elif identifier is None:
            raise ValueError("Sequence input requires a FASTA header.")
        else:
            sequence.append(line)
    save()
    if not records or len({r["id"] for r in records}) != len(records):
        raise ValueError("Choose one to 50 FASTA records with unique identifiers.")
    return records
