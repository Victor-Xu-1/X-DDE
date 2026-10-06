"""Verify native endpoints against source coordinates and residues, without serial guessing."""

import math


class SourceCoordinates:
    def __init__(self, file, ligand_chain, ligand_number):
        self.points = {}
        self.ligand = (ligand_chain, ligand_number)
        seen = set()
        for line in file.read_text().splitlines():
            if not line.startswith(("ATOM  ", "HETATM")):
                continue
            serial = int(line[6:11])
            if serial in seen:
                raise ValueError(
                    "Choose one structural model with unique original atom identities."
                )
            seen.add(serial)
            point = tuple(float(line[start : start + 8]) for start in (30, 38, 46))
            if not all(math.isfinite(value) for value in point):
                raise ValueError("Source interaction coordinates must be finite.")
            residue = (line[21], int(line[22:26]), line[17:20].strip())
            self.points.setdefault(point, []).append(residue)

    def atom(self, atom, *, protein=None, ligand=False):
        native = tuple(float(value) for value in atom.coords)
        key = tuple(round(value, 3) for value in native)
        entries = self.points.get(key, [])
        if protein is not None:
            entries = [entry for entry in entries if entry == protein]
        if ligand:
            entries = [entry for entry in entries if entry[:2] == self.ligand]
        if not entries or math.dist(key, native) > 0.0009:
            raise ValueError(
                "A native interaction endpoint differs from the exact source frame or residue."
            )
        return list(key)
