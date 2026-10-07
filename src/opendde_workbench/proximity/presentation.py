"""Read-only bond-geometry projection from fully validated, unchanged native files."""

import hashlib

from ..artifacts import contained
from .attachment_geometry import boundary_bonds
from .graph_identity import graph_signature
from .result_models import ChemicalGraph


def present_ternary(value, output):
    native = value["proximity"]
    if not native["arm_maps"]:
        return value
    rows = []
    for assembly in native["assemblies"]:
        name = assembly["ligand_artifact"]
        file = contained(output, name)
        if file.stat().st_size > 5 * 1024**2:
            raise ValueError("Boundary inspection exceeds the molecular file budget.")
        raw = file.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != value["artifact_sha256"][name]:
            raise ValueError("The inspected molecular pose changed after native validation.")
        lines = raw.decode("utf-8").splitlines()
        graph = graph_signature(lines)
        if ChemicalGraph.model_validate(graph).model_dump(mode="json") != native["chemical_graph"]:
            raise ValueError("The inspected whole-molecule covalent graph changed.")
        points = [
            tuple(float(line[start : start + 10]) for start in (0, 10, 20))
            for line in lines[4 : 4 + len(graph["atoms"])]
        ]
        rows.append(
            {
                "id": assembly["id"],
                "ligand_artifact": name,
                "sha256": digest,
                "bonds": boundary_bonds(
                    graph, native["ligand_atom_indices"], native["arm_maps"], points
                ),
            }
        )
    # This is a versioned display measurement, not another model output or a new
    # saved pose. Original reports, source files and qualification stay untouched.
    return {
        **value,
        "proximity": {
            **native,
            "attachment_geometry": {
                "method": "source_graph_region_boundary_direction_v1",
                "scope": "observed_bond_direction_not_allowed_growth_or_clearance",
                "source_ligand": native["source_ligand"],
                "assemblies": rows,
            },
        },
    }
