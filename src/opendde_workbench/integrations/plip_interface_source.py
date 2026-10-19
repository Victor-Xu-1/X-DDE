"""Retain deposited modified-polymer annotations and verify interface endpoints."""

import math
from pathlib import Path

from plip_coordinates import SourceCoordinates


def annotated_source(converted, original, index):
    """Biopython's atom writer omits MODRES; restore only explicit deposited metadata."""
    text = converted.read_text()
    if original.suffix == ".pdb":
        return converted
    from Bio.PDB.MMCIF2Dict import MMCIF2Dict

    data = MMCIF2Dict(str(original))
    prefix = "_pdbx_struct_mod_residue."
    columns = ["auth_comp_id", "auth_asym_id", "auth_seq_id", "PDB_ins_code", "parent_comp_id"]
    records = [data.get(prefix + key, []) for key in columns]
    if not any(records):
        return converted
    if len({len(column) for column in records}) != 1:
        raise ValueError("Incomplete deposited modified-polymer annotations.")
    headers = []
    for name, chain, number, insertion, parent in zip(*records, strict=True):
        insertion = " " if insertion in {"?", "."} else insertion
        if not (
            1 <= len(name) <= 3 and len(chain) == len(insertion) == 1 and 1 <= len(parent) <= 3
        ):
            raise ValueError("Modified-polymer identity cannot be represented in this PDB adapter.")
        number = int(number)
        if not -999 <= number <= 9999:
            raise ValueError("Modified-polymer residue number exceeds the PDB adapter range.")
        headers.append(
            f"MODRES XXXX {name:>3} {chain} {number:4d}{insertion} {parent:>3}  "
            "DEPOSITED MODIFICATION\n"
        )
    target = Path("/output/native-inputs") / f"interface-{index}.pdb"
    target.parent.mkdir(exist_ok=True)
    target.write_text("".join(headers) + text)
    return target


class InterfaceCoordinates(SourceCoordinates):
    """Every classified atom or group center stays bound to its original residue."""

    def __init__(self, file, target_chains, binder_chains):
        super().__init__(file, "", 0)
        self.targets, self.binders = set(target_chains), set(binder_chains)
        self.identities, self.verified = {}, {}
        self.expected = set()
        lines = file.read_text().splitlines()
        modified = {
            (line[16], int(line[18:22]), line[12:15].strip(), line[22].strip())
            for line in lines
            if line.startswith("MODRES")
        }
        count = 0
        for line in lines:
            if not line.startswith(("ATOM  ", "HETATM")):
                continue
            count += 1
            point = tuple(float(line[start : start + 8]) for start in (30, 38, 46))
            identity = (line[21], int(line[22:26]), line[17:20].strip(), line[26].strip())
            self.identities.setdefault(point, set()).add(identity)
            if line.startswith("ATOM  ") or identity in modified:
                self.expected.add(identity)
            if line[16] not in {" ", "A"}:
                raise ValueError(
                    "Select one resolved alternate conformation before interface analysis."
                )
        if count > 50000:
            raise ValueError("Protein-interface analysis accepts at most 50,000 source atoms.")
        present = {r[0] for r in self.expected}
        if not (self.targets | self.binders) <= present:
            raise ValueError(
                "Every selected target and partner chain must contain source polymer residues."
            )

    def point(self, coordinates, *, protein=None, ligand=False):
        native = tuple(float(value) for value in coordinates)
        point = tuple(round(value, 3) for value in native)
        entries = self.identities.get(point, set())
        if protein is not None:
            entries = {r for r in entries if r[:3] == protein and r[0] in self.targets}
        if ligand:
            entries = {r for r in entries if r[0] in self.binders}
        if not entries or math.dist(point, native) > 0.0009:
            raise ValueError(
                "A native interface endpoint differs from its exact source frame or chain."
            )
        self.verified[(point, bool(ligand))] = entries
        return list(point)

    def group(self, atoms, center, *, protein=None, ligand=False, atom_center=False):
        atoms = list(atoms)
        value = super().group(
            atoms, center, protein=protein, ligand=ligand, atom_center=atom_center
        )
        members = [
            self.verified[(tuple(round(float(x), 3) for x in a.coords), bool(ligand))]
            for a in atoms
        ]
        identities = set.intersection(*members)
        if not identities:
            raise ValueError("An interface interaction group crosses distinct source residues.")
        self.verified[(tuple(value), bool(ligand))] = identities
        return value

    def annotate(self, row, item):
        target = (str(item.reschain), int(item.resnr), str(item.restype))
        partner = (str(item.reschain_l), int(item.resnr_l), str(item.restype_l))
        cofactor = row["kind"] == "metal_complex"
        selected = []
        for point, ligand, identity in (
            (row["protein_position"], False, target),
            (row["ligand_position"], not cofactor, partner),
        ):
            matches = {
                r for r in self.verified.get((tuple(point), ligand), set()) if r[:3] == identity
            }
            if len(matches) != 1:
                raise ValueError(
                    "Native interface residue identities are ambiguous or absent in the source."
                )
            selected.append(next(iter(matches)))
        row["insertion_code"] = selected[0][3]
        row["partner_role"] = "cofactor" if cofactor else "partner"
        row["partner"] = dict(
            zip(("chain", "number", "residue", "insertion_code"), selected[1], strict=True)
        )
        return row
