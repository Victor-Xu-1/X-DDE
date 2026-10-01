"""Observed structural evidence; unknown completeness/confidence is never invented."""

import math


def address(chain, residue):
    return {"chain": chain.id, "number": residue.id[1], "insertion_code": residue.id[2].strip()}


def profile(model):
    from Bio.PDB.Polypeptide import protein_letters_3to1_extended

    chains, evidence, missing = {}, [], []
    atoms = list(model.get_atoms())
    occupancies, b_factors = [], []
    for atom in atoms:
        occupancy, factor = atom.get_occupancy(), atom.get_bfactor()
        if occupancy is not None:
            if not math.isfinite(occupancy) or not 0 <= occupancy <= 1:
                raise ValueError("Structural occupancy must be finite and between zero and one.")
            occupancies.append(occupancy)
        if factor is not None:
            if not math.isfinite(factor):
                raise ValueError("Structural B-factor must be finite.")
            b_factors.append(factor)
    for chain in model.get_chains():
        residues = []
        for residue in chain.get_residues():
            code = protein_letters_3to1_extended.get(residue.get_resname().upper())
            if not code or not residue.has_id("CA"):
                continue
            if len(residues) >= 2000:
                raise ValueError(
                    "Protein-chain alignment is bounded to 2000 observed C-alpha residues."
                )
            residues.append((code, residue["CA"], address(chain, residue)))
            absent = [name for name in ("N", "C", "O") if not residue.has_id(name)]
            if absent:
                missing.append({**address(chain, residue), "missing": absent})
        if residues:
            chains[chain.id] = residues
            evidence.append(
                {
                    "chain": chain.id,
                    "observed_ca_count": len(residues),
                    "sequence": "".join(r[0] for r in residues),
                }
            )
    if not chains:
        raise ValueError("The selected model has no recognized protein C-alpha chain.")
    if sum(len(rows) for rows in chains.values()) > 5000:
        raise ValueError("Receptor alignment is bounded to 5000 observed C-alpha residues.")
    return chains, {
        "atom_count": len(atoms),
        "observed_residue_count": sum(1 for _ in model.get_residues()),
        "protein_chains": evidence,
        "incomplete_backbone": missing,
        "backbone_complete": not missing,
        "sidechain_completeness": "not_checked",
        "unobserved_residues": "not_inferred",
        "bfactor_mean": sum(b_factors) / len(b_factors) if b_factors else None,
        "bfactor_interpretation": "raw_bfactor_not_automatic_plddt",
        "occupancy_minimum": min(occupancies) if occupancies else None,
        "biological_assembly": "provided_coordinates_only",
    }
