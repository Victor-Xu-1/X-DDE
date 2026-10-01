"""Exact sequence source binding; modified constructs require a separately saved version."""


def validate_sequence_source(path, value):
    if path.suffix not in {".fasta", ".fa"} or path.stat().st_size > 200000:
        raise ValueError("Sequence source must be a bounded FASTA file.")
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    if (
        not lines
        or not lines[0].startswith(">")
        or sum(line.startswith(">") for line in lines) != 1
    ):
        raise ValueError("Choose one exact sequence record for source provenance.")
    if "".join(line.strip() for line in lines[1:]).upper() != value:
        raise ValueError(
            "Sequence differs from its source; save and select a new sequence version."
        )
