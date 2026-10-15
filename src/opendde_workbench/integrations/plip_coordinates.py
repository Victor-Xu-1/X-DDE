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
        return self.point(atom.coords, protein=protein, ligand=ligand)

    def point(self, coordinates, *, protein=None, ligand=False):
        native = tuple(float(value) for value in coordinates)
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

    def group(self, atoms, center, *, protein=None, ligand=False, atom_center=False):
        atoms = list(atoms)
        if not 1 <= len(atoms) <= 256 or len(center) != 3:
            raise ValueError(
                "A native interaction group needs bounded original atoms and a center."
            )
        points = [self.atom(atom, protein=protein, ligand=ligand) for atom in atoms]
        native = tuple(float(value) for value in center)
        if atom_center:
            # PLIP places phosphate/sulfate/guanidine charge centers on a source
            # atom, which need not be the centroid of its contributing atoms.
            return self.point(native, protein=protein, ligand=ligand)
        average = tuple(sum(point[axis] for point in points) / len(points) for axis in range(3))
        if not all(math.isfinite(value) for value in native) or math.dist(average, native) > 0.001:
            raise ValueError("A native interaction center differs from its original source atoms.")
        return list(native)
