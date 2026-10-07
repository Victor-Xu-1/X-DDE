"""SASA in assembly versus isolated selected region. No inferred assembly or energies."""

import csv
import hashlib
import math
from collections import defaultdict

from Bio import __version__ as bio_version
from Bio.PDB.SASA import ATOMIC_RADII, ShrakeRupley
from native_io import input_file, read_model, write_model
from selection import MemberSelection
from surface_options import SurfaceOptions, SurfaceRegion

# Reviewed element radii, not Biopython's unknown-element 2 A fallback or ionic radii.
ELEMENTS = frozenset(("C", "N", "O", "F", "P", "S", "CL", "BR", "I", "SE"))


def address(residue):
    chain = residue.get_parent().id
    return (chain, residue.id[1], residue.id[2].strip(), residue.resname.strip())


def clean_context(model):
    removed = {"water_residues": 0, "hydrogen_atoms": 0}
    for chain in list(model):
        for residue in list(chain):
            if residue.id[0] == "W" or residue.resname.strip() in {"HOH", "WAT", "DOD"}:
                chain.detach_child(residue.id)
                removed["water_residues"] += 1
                continue
            for atom in list(residue):
                if atom.element.upper() in {"H", "D"}:
                    residue.detach_child(atom.id)
                    removed["hydrogen_atoms"] += 1
            if not len(residue):
                chain.detach_child(residue.id)
        if not len(chain):
            model.detach_child(chain.id)
    atoms = list(model.get_atoms())
    if not 1 <= len(atoms) <= 30000:
        raise ValueError(
            "Exposure supports 1 to 30000 observed heavy atoms in the selected context."
        )
    unknown = sorted({a.element.upper() for a in atoms} - ELEMENTS)
    if unknown:
        raise ValueError(
            "Unreviewed element radii: "
            + ", ".join(unknown)
            + ". Prepare an explicit supported context first."
        )
    from Bio.PDB import NeighborSearch

    if NeighborSearch(atoms).search_all(0.1):
        raise ValueError("Coincident heavy atoms invalidate this structural measurement.")
    return atoms, removed


def csv_file(output, name, rows):
    with (output / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return hashlib.sha256((output / name).read_bytes()).hexdigest()


def run_surface(request, bindings, directory, output):
    options = SurfaceOptions.model_validate(request["options"])
    regions = [SurfaceRegion.model_validate(v) for v in request["regions"]]
    keys = [(r.chain, r.number, r.insertion_code, r.resname) for r in regions]
    if not 1 <= len(keys) <= 128 or len(set(keys)) != len(keys):
        raise ValueError("Choose one to 128 distinct region identities.")
    file = input_file(request["structure"], bindings, directory)
    context, inspection = read_model(
        file, MemberSelection(model_index=options.model_index, chains=options.context_chains)
    )
    atoms, removed = clean_context(context)
    if len(atoms) * options.sphere_points > 30000000:
        raise ValueError(
            "Surface resolution exceeds the bounded measurement budget; "
            "select fewer context chains or fewer sampling points."
        )
    matches = defaultdict(list)
    for residue in context.get_residues():
        matches[address(residue)].append(residue)
    if any(len(matches[k]) != 1 for k in keys):
        raise ValueError(
            "Each selected region must match exactly one retained residue or ligand in this model."
        )
    target = [a for k in keys for a in matches[k][0].get_atoms()]
    if not 1 <= len(target) <= 5000:
        raise ValueError("Choose a region with 1 to 5000 observed heavy atoms.")
    target_set = set(keys)
    isolated = context.copy()
    for chain in list(isolated):
        for residue in list(chain):
            if address(residue) not in target_set:
                chain.detach_child(residue.id)
        if not len(chain):
            isolated.detach_child(chain.id)
    # The same points and radii make assembly occlusion a monotonic comparison.
    calculator = ShrakeRupley(
        probe_radius=options.probe_radius_angstrom, n_points=options.sphere_points
    )
    calculator.compute(context, level="A")
    calculator.compute(isolated, level="A")
    isolated_areas = {
        (address(a.get_parent()), a.name): float(a.sasa) for a in isolated.get_atoms()
    }
    atom_rows, residue_rows = [], []
    for region, key in zip(regions, keys, strict=True):
        rows = []
        for atom in matches[key][0].get_atoms():
            free = isolated_areas[(key, atom.name)]
            assembled = float(atom.sasa)
            buried = free - assembled
            if not all(math.isfinite(v) and v >= -1e-7 for v in (free, assembled, buried)):
                raise ValueError("Surface comparison violates non-negative occlusion.")
            rows.append(
                {
                    **region.model_dump(),
                    "atom": atom.name,
                    "element": atom.element,
                    "isolated_area": free,
                    "assembly_area": assembled,
                    "buried_area": max(0.0, buried),
                }
            )
        atom_rows.extend(rows)
        free = sum(v["isolated_area"] for v in rows)
        assembled = sum(v["assembly_area"] for v in rows)
        residue_rows.append(
            {
                **region.model_dump(),
                "atom_count": len(rows),
                "isolated_area": free,
                "assembly_area": assembled,
                "buried_area": max(0.0, free - assembled),
            }
        )
    preview = "context" + file.suffix
    preview_sha = write_model(context, output / preview)
    return {
        "operation": "surface_exposure",
        "complete": True,
        "schema_version": 1,
        "source": request["structure"],
        "regions": [v.model_dump() for v in regions],
        "options": options.model_dump(mode="json"),
        "inspection": inspection,
        "removed": removed,
        "context_atoms": len(atoms),
        "target_atoms": len(target),
        "residues": residue_rows,
        "atoms": atom_rows,
        "isolated_area": sum(v["isolated_area"] for v in residue_rows),
        "assembly_area": sum(v["assembly_area"] for v in residue_rows),
        "buried_area": sum(v["buried_area"] for v in residue_rows),
        "artifacts": {
            preview: preview_sha,
            "regions.csv": csv_file(output, "regions.csv", residue_rows),
            "atoms.csv": csv_file(output, "atoms.csv", atom_rows),
        },
        "preview_artifact": preview,
        "area_unit": "angstrom_squared",
        "coordinate_frame": "source_coordinates_selected_model",
        "method": "Biopython Shrake-Rupley",
        "radii_angstrom": {e: ATOMIC_RADII[e] for e in sorted({a.element for a in atoms})},
        "atom_policy": "observed_heavy_atoms_without_water",
        "biological_assembly": "provided_coordinates_only",
        "scope": "surface_accessibility_not_energy_affinity_or_linker_passage",
        "versions": {"biopython": bio_version},
    }
