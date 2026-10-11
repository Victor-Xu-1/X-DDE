"""Check observed peptide geometry without inferring sequence or changing coordinates."""

import math

PROTEIN_RESIDUES = frozenset(
    "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL "
    "HID HIE HIP CYX ASH GLH LYN".split()
)


def validate_peptide_links(topology, positions_angstrom, *, require_complete=True):
    """Reject discontinuous adjacent protein residues in each explicit topology chain.

    Author residue numbering is not a sequence-completeness test. Geometry is
    checked after PDBFixer repairs missing atoms, before solvent or force-field
    preparation can turn an unresolved gap into a spurious peptide bond.
    """
    for chain in topology.chains():
        previous = None
        for residue in chain.residues():
            if residue.name not in PROTEIN_RESIDUES:
                previous = None
                continue
            atoms = {atom.name: atom for atom in residue.atoms()}
            if require_complete and not {"N", "CA", "C"} <= atoms.keys():
                raise ValueError(
                    f"Incomplete protein backbone in chain {chain.id}, residue {residue.id}. "
                    "Prepare a complete structure before dynamics."
                )
            if previous is not None and "N" in atoms:
                preceding, carbon = previous
                distance = math.dist(
                    positions_angstrom[carbon.index], positions_angstrom[atoms["N"].index]
                )
                if not math.isfinite(distance) or not 0.9 <= distance <= 1.8:
                    raise ValueError(
                        f"Unresolved peptide link in chain {chain.id}: "
                        f"residues {preceding.id} to {residue.id} have invalid C-N geometry. "
                        "Repair the backbone or prepare explicit chain fragments before dynamics; "
                        "no missing sequence or connecting bond is invented."
                    )
            previous = (residue, atoms["C"]) if "C" in atoms else None
