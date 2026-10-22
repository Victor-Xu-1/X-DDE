"""Deterministic A3M column selection; no search, realignment or model inference."""

import hashlib


def slice_columns(rows, query, start, stop):
    """Select a zero-based half-open interval and its preceding insertions.

    A lowercase insertion is attached to the next aligned column, matching the
    official Boltz deletion-index convention. Preserve headers and input order;
    exclude only rows with no aligned residue in the selected interval.
    """
    if (
        type(start) is not int
        or type(stop) is not int
        or not 0 <= start < stop <= len(query)
        or not rows
        or rows[0][1] != query
    ):
        raise ValueError("Choose a nonempty interval of the exact alignment query.")
    retained, excluded = [], []
    for header, sequence in rows:
        column, selected = 0, []
        for letter in sequence:
            if start <= column < stop:
                selected.append(letter)
            if not letter.islower():
                column += 1
        if column != len(query):
            raise ValueError("An alignment row differs from the query's column count.")
        selected = "".join(selected)
        if any(letter.isupper() for letter in selected):
            retained.append((header, selected))
        else:
            excluded.append(
                {"header": header, "sequence_sha256": hashlib.sha256(sequence.encode()).hexdigest()}
            )
    if not retained or retained[0][1] != query[start:stop]:
        raise ValueError("Selected alignment columns do not retain their exact query.")
    return retained, excluded


def a3m_bytes(rows):
    return "".join(header + "\n" + sequence + "\n" for header, sequence in rows).encode("utf-8")
