"""Run inside the external compute image; never fabricates missing scientific metrics."""

import hashlib
import json
import math
from pathlib import Path

import biotite.structure as structure
import numpy as np
from biotite.structure.io.pdbx import CIFFile, get_structure, set_structure
from molecule_math import molecular_properties


def finite(value):
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def contacts(atoms):
    heavy = atoms.element != "H"
    protein_mask = structure.filter_amino_acids(atoms)
    nucleotide_mask = structure.filter_nucleotides(atoms)
    ion_mask = np.isin(atoms.res_name, ["MG", "ZN", "CA", "NA", "K", "CL", "MN", "FE", "CU", "CO"])
    ligand = atoms[
        atoms.hetero
        & heavy
        & ~protein_mask
        & ~nucleotide_mask
        & ~ion_mask
        & ~np.isin(atoms.res_name, ["HOH", "WAT"])
    ]
    protein = atoms[protein_mask & heavy]
    if not len(ligand) or not len(protein):
        return []
    matches = {}
    # Chunk by ligand atoms so large user inputs cannot allocate an unbounded distance matrix.
    for start in range(0, len(ligand), 32):
        chunk = ligand[start : start + 32]
        distances = np.linalg.norm(chunk.coord[:, None, :] - protein.coord[None, :, :], axis=2)
        for li, pi in zip(*np.where(distances <= 4.0), strict=True):
            residue = f"{protein.chain_id[pi]}:{protein.res_name[pi]}{protein.res_id[pi]}"
            distance = float(distances[li, pi])
            if residue not in matches or distance < matches[residue]["distance"]:
                matches[residue] = {
                    "residue": residue,
                    "distance": distance,
                    "protein_atom": str(protein.atom_name[pi]),
                    "ligand_atom": str(chunk.atom_name[li]),
                }
    return sorted(matches.values(), key=lambda item: item["distance"])[:80]


def analyze(root: Path) -> dict:
    input_data = json.loads((root / "input.json").read_text())
    ligands = molecular_properties(input_data[0]["sequences"])
    candidates = []
    reference = None
    for path in sorted((root / "output").rglob("*_sample_*.cif"))[:64]:
        if path.is_symlink() or not path.resolve().is_relative_to((root / "output").resolve()):
            raise ValueError("Structure output escapes the managed task directory.")
        atoms = get_structure(CIFFile.read(path), model=1)
        if len(atoms) == 0 or not np.isfinite(atoms.coord).all():
            raise ValueError("Predicted structure has empty or non-finite coordinates.")
        summary_path = path.with_name(
            path.name.replace("_sample_", "_summary_confidence_sample_")
        ).with_suffix(".json")
        summary = json.loads(summary_path.read_text()) if summary_path.is_file() else {}
        sample_id = path.stem.split("_sample_")[-1]
        seed = next(
            (
                int(part[5:])
                for part in path.parts
                if part.startswith("seed_") and part[5:].isdigit()
            ),
            None,
        )
        candidate_id = (
            "sample-"
            + sample_id
            + "-"
            + hashlib.sha256(path.relative_to(root / "output").as_posix().encode()).hexdigest()[:12]
        )
        if seed is not None:
            candidate_id = f"seed-{seed}-sample-{sample_id}"
        rmsd = None
        aligned_relative = None
        signature = list(
            zip(
                atoms.chain_id.tolist(),
                atoms.res_id.tolist(),
                atoms.atom_name.tolist(),
                strict=True,
            )
        )
        if reference is None:
            reference = (signature, atoms)
            rmsd = 0.0
        elif signature == reference[0]:
            fitted, _ = structure.superimpose(reference[1], atoms)
            rmsd = float(structure.rmsd(reference[1], fitted))
            aligned = root / "analysis/workbench-aligned" / f"{candidate_id}.cif"
            aligned.parent.mkdir(exist_ok=True)
            aligned_file = CIFFile()
            set_structure(aligned_file, fitted)
            aligned_file.write(aligned)
            aligned_relative = aligned.relative_to(root).as_posix()
        candidates.append(
            {
                "id": candidate_id,
                "seed": seed,
                "artifact": path.relative_to(root / "output").as_posix(),
                "atom_count": len(atoms),
                "chains": sorted(set(atoms.chain_id.tolist())),
                "ranking_score": finite(summary.get("ranking_score")),
                "plddt": finite(summary.get("plddt")),
                "ptm": finite(summary.get("ptm")),
                "iptm": finite(summary.get("iptm")),
                "has_clash": summary.get("has_clash"),
                "rmsd_to_first": rmsd,
                "contacts": contacts(atoms),
                "aligned_artifact": aligned_relative,
            }
        )
    return {
        "schema_version": 4,
        "ligands": ligands,
        "candidates": candidates,
        "metric_notes": {
            "affinity": "OpenDDE preview does not provide calibrated binding affinity in kcal/mol.",
            "contacts": "Heavy-atom proximity within 4 angstrom; not hydrogen-bond classification.",
            "sa": "RDKit SA score: lower is easier; not a synthesis route or guarantee.",
            "confidence": "Native OpenDDE confidence metrics; not measured potency.",
        },
    }


if __name__ == "__main__":
    root = Path("/job")
    result = analyze(root)
    destination = root / "analysis/workbench-analysis.json"
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
    temporary.replace(destination)
