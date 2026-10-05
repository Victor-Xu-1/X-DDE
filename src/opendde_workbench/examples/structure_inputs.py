"""Explicit coordinate-preserving protein selection for fixed public input templates."""


def protein_only_pdb(data: bytes) -> bytes:
    selected = []
    for line in data.decode("utf-8").splitlines():
        if line[:6].strip() in {"ATOM", "TER", "MODEL", "ENDMDL", "END", "SSBOND"}:
            selected.append(line)
    if not any(line.startswith("ATOM  ") for line in selected):
        raise ValueError("The public structure contains no protein ATOM records.")
    return ("\n".join(selected) + "\n").encode()
