"""Protect declared inter-residue bonds; never infer bonds from clashing coordinates."""


def declared_links(raw: bytes, atoms: dict, selected: list[str], backbone: frozenset) -> None:
    by_serial = {atom.serial: atom for atom in atoms.values()}

    def movable(atom):
        return atom is not None and atom.token in selected and atom.name not in backbone

    def token(chain, number, insertion):
        return f"{chain}:{int(number)}" + (":" + insertion.strip() if insertion.strip() else "")

    for line in raw.decode("ascii").splitlines():
        if line.startswith("CONECT"):
            numbers = [
                int(line[i : i + 5]) for i in range(6, len(line), 5) if line[i : i + 5].strip()
            ]
            if not numbers:
                continue
            for number in numbers[1:]:
                left, right = by_serial.get(numbers[0]), by_serial.get(number)
                if (movable(left) and (right is None or left.token != right.token)) or (
                    movable(right) and (left is None or left.token != right.token)
                ):
                    raise ValueError(
                        "A selected residue has a declared external bond; keep it fixed."
                    )
        elif line.startswith("LINK  "):
            if len(line) < 57:
                raise ValueError("Receptor contains an incomplete LINK declaration.")
            linked = [
                token(line[21], line[22:26], line[26]),
                token(line[51], line[52:56], line[56]),
            ]
            if any(
                value in selected and name not in backbone
                for value, name in zip(
                    linked, (line[12:16].strip(), line[42:46].strip()), strict=True
                )
            ):
                raise ValueError("A selected residue has a declared LINK bond; keep it fixed.")
        elif line.startswith("SSBOND"):
            if len(line) < 36:
                raise ValueError("Receptor contains an incomplete disulfide declaration.")
            linked = [
                token(line[15], line[17:21], line[21]),
                token(line[29], line[31:35], line[35]),
            ]
            if any(value in selected for value in linked):
                raise ValueError("A selected residue has a declared disulfide bond; keep it fixed.")
