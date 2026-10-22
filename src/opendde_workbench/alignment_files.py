"""Bounded protein alignments shared by upload, admission and native transport."""

import csv
import io
from pathlib import Path

MAX_BYTES = 25 * 1024**2
MAX_ROWS = 32767  # Official Boltz MSASequence.seq_idx uses signed int16.
LETTERS = set("ACDEFGHIKLMNPQRSTVWYXacdefghiklmnpqrstvwyx-")


def alignment_rows(text, suffix):
    """Retain alignment letters, insertions and explicit pairing keys verbatim."""
    if suffix == ".csv":
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None or sorted(reader.fieldnames) != ["key", "sequence"]:
            raise ValueError("Paired MSA CSV requires exactly the sequence and key columns.")
        keys = set()
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("An MSA CSV row has missing or extra cells.")
            key = row["key"].strip()
            if key not in {"", "-1"}:
                if not key.isascii() or not key.isdecimal() or not 0 <= int(key) <= 2147483647:
                    raise ValueError("MSA pairing keys must be integers; use -1 for unpaired rows.")
                identity = int(key)
                if identity in keys:
                    raise ValueError("A paired MSA key occurs more than once in this chain.")
                keys.add(identity)
            yield key, row["sequence"].strip()
    elif suffix == ".a3m":
        header, sequence = None, []
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith(">"):
                if header is not None:
                    yield header, "".join(sequence)
                header, sequence = line, []
            else:
                if header is None:
                    raise ValueError("An A3M alignment must start with a FASTA header.")
                sequence.append(line)
        if header is not None:
            yield header, "".join(sequence)
    else:
        raise ValueError("Choose an A3M alignment or paired-MSA CSV.")


def checked_alignment(text, suffix, query=None):
    rows, width, first = [], None, None
    for header, sequence in alignment_rows(text, suffix):
        if not sequence or not set(sequence) <= LETTERS:
            raise ValueError("An MSA row contains empty or unsupported protein letters.")
        aligned = "".join(letter for letter in sequence if not letter.islower())
        if not aligned or len(aligned) > 5000:
            raise ValueError("An MSA alignment needs one to 5000 protein columns.")
        if width is None:
            width, first = len(aligned), sequence
        if len(aligned) != width:
            raise ValueError("All MSA rows must cover the same alignment columns.")
        if len(rows) >= MAX_ROWS:
            raise ValueError("This MSA exceeds the bounded 32767-row input limit.")
        rows.append((header, sequence))
    if not rows:
        raise ValueError("The alignment contains no sequence records.")
    if query is not None and first != query:
        raise ValueError("The MSA query differs from this protein sequence.")
    return rows


def read_alignment(path, query=None):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError("Choose a complete regular MSA file of at most 25 MiB.")
    return checked_alignment(path.read_text(encoding="utf-8-sig"), path.suffix, query)


def write_alignment(rows, target):
    """Normalize wrapping only in a separate native input; original bytes are immutable."""
    target = Path(target)
    with target.open("w", encoding="utf-8", newline="") as stream:
        if target.suffix == ".csv":
            writer = csv.writer(stream)
            writer.writerow(["key", "sequence"])
            writer.writerows(rows)
        else:
            for header, sequence in rows:
                stream.write(header + "\n" + sequence + "\n")
