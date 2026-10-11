"""Read-only protein geometry checks before OpenFE planning or charge assignment."""

from native_md_input import validate_peptide_links

STANDARD_RESIDUES = frozenset(
    "ALA ARG ASN ASP CYS CYX GLN GLU GLY HIS HID HIE HIP ILE LEU LYS MET "
    "PHE PRO SER THR TRP TYR VAL".split()
)
ALLOWED_RESIDUES = STANDARD_RESIDUES | {"HOH", "WAT", "ACE", "NME"}


def prepared_protein(source):
    import numpy as np
    from openmm import app, unit

    protein = app.PDBFile(str(source))
    residues = list(protein.topology.residues())
    if any(residue.name not in ALLOWED_RESIDUES for residue in residues):
        raise ValueError(
            "Use a prepared protein-only structure; cofactors/metals need a specialized protocol."
        )
    if not any(residue.name in STANDARD_RESIDUES for residue in residues):
        raise ValueError("FEP requires a prepared protein structure, not solvent alone.")
    coordinates = np.asarray(protein.positions.value_in_unit(unit.angstrom), dtype=float)
    if (
        coordinates.shape != (protein.topology.getNumAtoms(), 3)
        or not np.isfinite(coordinates).all()
    ):
        raise ValueError("FEP protein coordinates are invalid; prepare a finite structure.")
    validate_peptide_links(protein.topology, coordinates)
    return coordinates
