"""Coordinate-preserving native docking preparation; original receptor remains immutable."""

from pathlib import Path

from alternate_locations import pdb_lines


def prepare(file, retain=(), alternate_locations="reject"):
    original = file.read_text()
    if sum(line.startswith("MODEL ") for line in original.splitlines()) > 1:
        raise ValueError("Choose one observed receptor model before docking.")
    requested = {name.upper() for name in retain}
    found = set()
    lines = []
    resolved, _ = pdb_lines(original, alternate_locations)
    for line in resolved:
        if line.startswith("ATOM  "):
            lines.append(line)
        elif line.startswith("HETATM") and line[17:20].strip() in requested:
            found.add(line[17:20].strip())
            lines.append(line)
        elif line.startswith(("TER   ", "MODEL ", "ENDMDL")):
            lines.append(line)
    if requested - found or not any(line.startswith("ATOM  ") for line in lines):
        raise ValueError(
            "A requested cofactor is absent or the selected receptor has no protein atoms."
        )
    output = Path("/output/receptor.pdb")
    output.write_text("\n".join(lines) + "\nEND\n")
    return output
