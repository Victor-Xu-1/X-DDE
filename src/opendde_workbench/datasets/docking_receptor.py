"""Coordinate-preserving native docking preparation; original receptor remains immutable."""

import hashlib
import json
from pathlib import Path

from alternate_locations import pdb_lines


def prepare(file, retain=(), alternate_locations="reject"):
    original = file.read_text()
    if sum(line.startswith("MODEL ") for line in original.splitlines()) > 1:
        raise ValueError("Choose one observed receptor model before docking.")
    requested = {name.upper() for name in retain}
    found = set()
    lines = []
    resolved, selected = pdb_lines(original, alternate_locations)
    # Selection has already resolved the alternatives. Export one ordinary PDB
    # conformer so downstream parsers do not discard B atoms or reject A labels.
    for line in resolved:
        if line.startswith("ATOM  "):
            lines.append(line[:16] + " " + line[17:])
        elif line.startswith("HETATM") and line[17:20].strip() in requested:
            found.add(line[17:20].strip())
            lines.append(line[:16] + " " + line[17:])
        elif line.startswith(("TER   ", "MODEL ", "ENDMDL")):
            lines.append(line)
    if requested - found or not any(line.startswith("ATOM  ") for line in lines):
        raise ValueError(
            "A requested cofactor is absent or the selected receptor has no protein atoms."
        )
    output = Path("/output/receptor.pdb")
    output.write_text("\n".join(lines) + "\nEND\n")
    output.with_name("receptor-selection.json").write_text(
        json.dumps(
            {
                "source_sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                "prepared_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "alternate_location_policy": alternate_locations,
                "selected_residue_conformers": [
                    {
                        "chain": residue[0],
                        "number": residue[1:5].strip(),
                        "insertion": residue[5].strip(),
                        "alternate_location": label,
                    }
                    for residue, label in sorted(selected.items())
                ],
                "exported_alternate_location": "blank_after_explicit_selection",
                "coordinates": "unchanged_observed_coordinates",
            }
        )
    )
    return output
