"""Translate native PLIP contacts without moving or guessing their source endpoints."""

import math


def charge_center(group, original, *, protein=None, ligand=False, detector=None, centers=()):
    atomic_groups = {"phosphate", "sulfonicacid", "sulfate", "guanidine"}
    atomic = getattr(group, "fgroup", None) in atomic_groups
    # PLIP's receptor pcharge tuple omits fgroup. Recover its center convention
    # only with the same native functional-group detector on the exact center atom.
    if not atomic and detector is not None and protein is not None:
        atomic = any(
            math.dist(atom.coords, group.center) < 1e-6
            and any(detector.is_functional_group(atom, kind) for kind in atomic_groups)
            for atom in centers
        )
    return original.group(
        group.atoms,
        group.center,
        protein=protein,
        ligand=ligand,
        atom_center=atomic,
    )


def edge(kind, item, protein, ligand):
    protein_point = [float(value) for value in protein]
    ligand_point = [float(value) for value in ligand]
    return {
        "kind": kind,
        "chain": str(item.reschain),
        "number": int(item.resnr),
        "residue": str(item.restype),
        "protein_position": protein_point,
        "ligand_position": ligand_point,
        "distance": math.dist(protein_point, ligand_point),
    }


def profile_contacts(profile, original, *, annotate=None):
    detector = getattr(profile, "bindingsite", None)
    center_atoms = {}
    for atom in getattr(detector, "all_atoms", ()):
        center_atoms.setdefault(tuple(atom.coords), []).append(atom)

    def protein_charge(group, residue):
        return charge_center(
            group,
            original,
            protein=residue,
            detector=detector,
            centers=center_atoms.get(tuple(group.center), ()),
        )

    def contact(kind, item, protein, ligand):
        row = edge(kind, item, protein, ligand)
        return annotate(row, item) if annotate else row

    interactions = []
    for item in profile.hydrophobic_contacts:
        protein = (str(item.reschain), int(item.resnr), str(item.restype))
        interactions.append(
            contact(
                "hydrophobic",
                item,
                original.atom(item.bsatom, protein=protein),
                original.atom(item.ligatom, ligand=True),
            )
        )
    for values, protein_donor in ((profile.hbonds_pdon, True), (profile.hbonds_ldon, False)):
        for item in values:
            protein = item.d if protein_donor else item.a
            ligand = item.a if protein_donor else item.d
            residue = (str(item.reschain), int(item.resnr), str(item.restype))
            interactions.append(
                contact(
                    "hydrogen_bond",
                    item,
                    original.atom(protein, protein=residue),
                    original.atom(ligand, ligand=True),
                )
            )
    for item in profile.pistacking:
        residue = (str(item.reschain), int(item.resnr), str(item.restype))
        interactions.append(
            contact(
                "pi_stack",
                item,
                original.group(item.proteinring.atoms, item.proteinring.center, protein=residue),
                original.group(item.ligandring.atoms, item.ligandring.center, ligand=True),
            )
        )
    for values, positive in ((profile.saltbridge_pneg, False), (profile.saltbridge_lneg, True)):
        for item in values:
            protein = item.positive if positive else item.negative
            ligand = item.negative if positive else item.positive
            residue = (str(item.reschain), int(item.resnr), str(item.restype))
            interactions.append(
                contact(
                    "salt_bridge",
                    item,
                    protein_charge(protein, residue),
                    charge_center(ligand, original, ligand=True),
                )
            )
    for values, protein_charged in ((profile.pication_laro, True), (profile.pication_paro, False)):
        for item in values:
            protein = item.charge if protein_charged else item.ring
            ligand = item.ring if protein_charged else item.charge
            residue = (str(item.reschain), int(item.resnr), str(item.restype))
            interactions.append(
                contact(
                    "pi_cation",
                    item,
                    (
                        protein_charge(protein, residue)
                        if protein_charged
                        else original.group(protein.atoms, protein.center, protein=residue)
                    ),
                    (
                        original.group(ligand.atoms, ligand.center, ligand=True)
                        if protein_charged
                        else charge_center(ligand, original, ligand=True)
                    ),
                )
            )
    for item in profile.halogen_bonds:
        residue = (str(item.reschain), int(item.resnr), str(item.restype))
        interactions.append(
            contact(
                "halogen_bond",
                item,
                original.atom(item.acc.o, protein=residue),
                original.atom(item.don.x, ligand=True),
            )
        )
    for item in profile.water_bridges:
        protein = item.d if item.protisdon else item.a
        ligand = item.a if item.protisdon else item.d
        residue = (str(item.reschain), int(item.resnr), str(item.restype))
        row = contact(
            "water_bridge",
            item,
            original.atom(protein, protein=residue),
            original.atom(ligand, ligand=True),
        )
        row["bridge_position"] = original.atom(item.water)
        interactions.append(row)
    for item in profile.metal_complexes:
        if "protein" in item.location:
            residue = (str(item.reschain), int(item.resnr), str(item.restype))
            interactions.append(
                contact(
                    "metal_complex",
                    item,
                    original.atom(item.target.atom, protein=residue),
                    original.atom(item.metal),
                )
            )
    return interactions
