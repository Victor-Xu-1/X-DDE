"""Explicit coordinate-preserving protein selection for fixed public input templates."""


def protein_only_pdb(data: bytes) -> bytes:
    selected = []
    for line in data.decode("utf-8").splitlines():
        if line[:6].strip() in {"ATOM", "TER", "MODEL", "ENDMDL", "END", "SSBOND"}:
            selected.append(line)
    if not any(line.startswith("ATOM  ") for line in selected):
        raise ValueError("The public structure contains no protein ATOM records.")
    return ("\n".join(selected) + "\n").encode()


def observed_alt_a_pdb(data: bytes) -> bytes:
    """Select deposited alternate A explicitly; never generate or move atoms."""
    lines = data.decode("utf-8").splitlines()
    retained = {
        line[6:11]
        for line in lines
        if line[:6].strip() in {"ATOM", "HETATM"} and line[16:17] in {" ", "A"}
    }
    if not retained:
        raise ValueError("The public alternate-A selection contains no observed atoms.")
    selected = ["REMARK 900 X-DDE: deposited alternate A selected; observed coordinates retained."]
    for line in lines:
        record = line[:6].strip()
        if record in {"ATOM", "HETATM", "ANISOU"}:
            if line[6:11] not in retained or line[16:17] not in {" ", "A"}:
                continue
            selected.append(line[:16] + " " + line[17:])
        elif record == "CONECT":
            fields = [line[start : start + 5] for start in range(6, len(line), 5)]
            if not fields or fields[0] not in retained:
                continue
            neighbors = [field for field in fields[1:] if field in retained]
            if neighbors:
                selected.append("CONECT" + fields[0] + "".join(neighbors))
        elif record != "MASTER":
            selected.append(line)
    return ("\n".join(selected) + "\n").encode()
