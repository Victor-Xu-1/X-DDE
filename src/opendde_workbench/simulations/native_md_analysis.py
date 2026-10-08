"""Coordinate-derived stability metrics with one rigid protein reference frame."""

import numpy as np


class TrajectoryAnalysis:
    def __init__(self, topology, masses=None):
        self.topology = topology
        self.atoms = list(topology.atoms())
        self.backbone = [i for i, a in enumerate(self.atoms) if a.name in {"CA", "P", "C4'"}]
        self.heavy = [i for i, a in enumerate(self.atoms) if a.element.atomic_number != 1]
        self.ligand = [i for i in self.heavy if self.atoms[i].residue.name == "XLG"]
        self.masses = (
            np.asarray(masses, dtype=float) if masses is not None else np.ones(len(self.atoms))
        )
        if (
            self.masses.shape != (len(self.atoms),)
            or not np.isfinite(self.masses).all()
            or np.any(self.masses <= 0)
        ):
            raise ValueError("Dynamics solute masses are invalid.")
        if len(self.backbone) < 3:
            raise ValueError(
                "Dynamics stability analysis needs at least three backbone reference atoms."
            )
        self.reference = None
        self.frames = []
        self.contacts = {}

    def add(self, positions, box=None):
        points = np.asarray(positions, dtype=float)
        if points.shape != (len(self.atoms), 3) or not np.isfinite(points).all():
            raise ValueError("Native trajectory contains invalid coordinates.")
        if self.reference is None:
            self.reference = points.copy()
        moving = points[self.backbone]
        fixed = self.reference[self.backbone]
        u, _, vt = np.linalg.svd((moving - moving.mean(0)).T @ (fixed - fixed.mean(0)))
        rotation = u @ np.diag([1, 1, np.linalg.det(u @ vt)]) @ vt
        aligned = (points - moving.mean(0)) @ rotation + fixed.mean(0)
        rotated_box = np.asarray(box) @ rotation if box is not None else None
        inverse_box = np.linalg.inv(rotated_box) if rotated_box is not None else None
        if self.ligand and inverse_box is not None:
            translation = (
                aligned[self.ligand].mean(0) - self.reference[self.ligand].mean(0)
            ) @ inverse_box
            # Reimage the connected ligand as a whole in the first-production frame.
            aligned[self.ligand] -= np.round(translation) @ rotated_box
        self.frames.append(aligned)
        backbone_rmsd = np.sqrt(np.mean(np.sum((aligned[self.backbone] - fixed) ** 2, axis=1)))
        ligand_rmsd = None
        if self.ligand:
            ligand_rmsd = float(
                np.sqrt(
                    np.mean(
                        np.sum((aligned[self.ligand] - self.reference[self.ligand]) ** 2, axis=1)
                    )
                )
            )
            receptor = [i for i in self.heavy if i not in self.ligand]
            for residue in {self.atoms[i].residue for i in receptor}:
                indices = [i for i in receptor if self.atoms[i].residue == residue]
                delta = aligned[self.ligand, None] - aligned[indices]
                if inverse_box is not None:
                    fractional = delta @ inverse_box
                    delta = (fractional - np.round(fractional)) @ rotated_box
                distance = np.linalg.norm(delta, axis=2).min()
                if distance <= 4:
                    key = (residue.chain.id, residue.id, residue.insertionCode, residue.name)
                    self.contacts[key] = self.contacts.get(key, 0) + 1
        heavy = aligned[self.heavy]
        masses = self.masses[self.heavy]
        center = np.average(heavy, axis=0, weights=masses)
        rg = np.sqrt(np.average(np.sum((heavy - center) ** 2, axis=1), weights=masses))
        return aligned, float(backbone_rmsd), ligand_rmsd, float(rg)

    def finish(self):
        frames = np.asarray(self.frames)
        rmsf = np.sqrt(np.mean(np.sum((frames - frames.mean(0)) ** 2, axis=2), axis=0))
        residues = []
        for residue in self.topology.residues():
            indices = [i for i in self.heavy if self.atoms[i].residue == residue]
            if indices:
                residues.append(
                    {
                        "chain": residue.chain.id,
                        "number": residue.id,
                        "insertion": residue.insertionCode,
                        "name": residue.name,
                        "rmsf_angstrom": float(np.mean(rmsf[indices])),
                    }
                )
        contacts = [
            {
                "chain": chain,
                "number": number,
                "insertion": insertion,
                "name": name,
                "occupancy": count / len(frames),
            }
            for (chain, number, insertion, name), count in self.contacts.items()
        ]
        return residues, sorted(contacts, key=lambda c: -c["occupancy"])
