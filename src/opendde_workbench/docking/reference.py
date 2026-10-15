"""Bounded, symmetry-aware reference distances in the original receptor frame.

This is a geometry comparison, never an alignment, affinity or validation verdict.
Contact atoms are selected from the reference before inspecting native output.
"""

import numpy as np
from chemistry import comparison_graph, plain_smiles

MATCH_LIMIT = 4096
CONTACT_CUTOFF = 4.0


def _graph(molecule):
    from rdkit import Chem

    return comparison_graph(Chem.RemoveHs(molecule))


def receptor_positions(file):
    from rdkit import Chem

    molecule = Chem.MolFromPDBFile(
        str(file), sanitize=False, removeHs=False, proximityBonding=False
    )
    if molecule is None or molecule.GetNumConformers() != 1:
        raise ValueError("Cannot read receptor coordinates for reference comparison.")
    indices = [a.GetIdx() for a in molecule.GetAtoms() if a.GetAtomicNum() > 1]
    positions = np.asarray(molecule.GetConformer().GetPositions())[indices]
    if not len(positions) or not np.isfinite(positions).all():
        raise ValueError("Reference comparison needs finite receptor heavy-atom coordinates.")
    return positions


class ReferenceGeometry:
    def __init__(self, reference, ligand, protein, source, role):
        self.reference = _graph(reference)
        self.indices = np.asarray(
            [a.GetIdx() for a in self.reference.GetAtoms() if a.GetAtomicNum() > 1],
            dtype=int,
        )
        self.positions = np.asarray(self.reference.GetConformer().GetPositions()).copy()
        self.contacts = np.asarray([], dtype=int)
        self.metadata = {
            "reference": source,
            "role": role,
            "status": "different_chemical_state",
            "method": "symmetry_aware_heavy_atom_no_fit",
            "unit": "angstrom",
            "heavy_atom_count": len(self.indices),
            "contact_atom_count": None,
            "contact_cutoff_angstrom": CONTACT_CUTOFF,
            "symmetry_mappings": None,
        }
        ligand = _graph(ligand)
        if plain_smiles(self.reference) != plain_smiles(ligand):
            return
        matches = self._matches(ligand)
        if len(matches) > MATCH_LIMIT:
            self.metadata["status"] = "symmetry_limit"
            return
        if not matches:
            raise ValueError("Identical reference chemistry lacks a stereochemical mapping.")
        # A 256 x receptor-atom array remains bounded by the existing 25 MiB input.
        # Chunk the receptor to avoid scaling peak memory with the whole protein.
        positions = receptor_positions(protein)
        minimum = np.full(len(self.indices), np.inf)
        for start in range(0, len(positions), 2048):
            delta = self.positions[self.indices, None, :] - positions[None, start : start + 2048, :]
            minimum = np.minimum(minimum, np.sum(delta * delta, axis=2).min(axis=1))
        self.contacts = self.indices[minimum <= CONTACT_CUTOFF**2]
        self.metadata.update(
            status="ready",
            contact_atom_count=len(self.contacts),
            symmetry_mappings=len(matches),
        )

    def _matches(self, molecule):
        return molecule.GetSubstructMatches(
            self.reference, uniquify=False, useChirality=True, maxMatches=MATCH_LIMIT + 1
        )

    def measure(self, molecule):
        if self.metadata["status"] != "ready":
            return None
        molecule = _graph(molecule)
        if plain_smiles(molecule) != plain_smiles(self.reference):
            raise ValueError(
                "Reference comparison cannot change molecular state or stereochemistry."
            )
        matches = self._matches(molecule)
        if len(matches) != self.metadata["symmetry_mappings"]:
            raise ValueError("Reference symmetry mapping differs from the input comparison.")
        positions = np.asarray(molecule.GetConformer().GetPositions())
        if not np.isfinite(positions).all():
            raise ValueError("Reference comparison needs finite native pose coordinates.")

        def rmsd(indices):
            if not len(indices):
                return None
            return min(
                float(
                    np.sqrt(
                        np.mean(
                            np.sum(
                                (positions[np.asarray(match)[indices]] - self.positions[indices])
                                ** 2,
                                axis=1,
                            )
                        )
                    )
                )
                for match in matches
            )

        return {"all_heavy": rmsd(self.indices), "contact": rmsd(self.contacts)}
