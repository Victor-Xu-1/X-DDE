"""Read the retained STAT6 graph geometry, without generating or repairing atoms.

Refs #122. This research diagnostic does not qualify a molecule, replace RDKit
chemical validation, or change the earlier rejected reconstruction experiment.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "tests/fixtures/stat6/inpaint_attachment"


def read_molecule(root, name, provenance):
    raw = (root / name).read_bytes()
    if len(raw) > 1024**2 or hashlib.sha256(raw).hexdigest() != provenance["files"][name]["sha256"]:
        raise ValueError("Retained fixture differs from its immutable provenance.")
    lines = raw.decode("ascii").splitlines()
    if "V2000" not in lines[3]:
        raise ValueError("This bounded diagnostic expects the retained V2000 fixture.")
    count, edges = int(lines[3][:3]), int(lines[3][3:6])
    if not 1 <= count <= 80 or not 0 <= edges <= 320:
        raise ValueError("Fixture atom/bond count exceeds its diagnostic bounds.")
    atoms = [
        (line[31:34].strip(), tuple(float(line[i : i + 10]) for i in (0, 10, 20)))
        for line in lines[4 : 4 + count]
    ]
    bonds = [
        (int(line[:3]) - 1, int(line[3:6]) - 1, int(line[6:9]))
        for line in lines[4 + count : 4 + count + edges]
    ]
    if (
        len(atoms) != count
        or len(bonds) != edges
        or any(not math.isfinite(value) for _, xyz in atoms for value in xyz)
    ):
        raise ValueError("Fixture coordinates or counts are invalid.")
    if any(a == b or not 0 <= a < count or not 0 <= b < count for a, b, _ in bonds):
        raise ValueError("Fixture bond endpoint is invalid.")
    return atoms, bonds


def components(nodes, bonds):
    remaining = set(nodes)
    while remaining:
        component, pending = set(), [min(remaining)]
        while pending:
            node = pending.pop()
            if node in component:
                continue
            component.add(node)
            for a, b, _ in bonds:
                other = b if a == node else a if b == node else None
                if other in remaining and other not in component:
                    pending.append(other)
        remaining -= component
        yield component


def center(rows):
    return [sum(xyz[i] for _, xyz in rows) / len(rows) for i in range(3)]


def measure(root=FIXTURE):
    provenance = json.loads((root / "provenance.json").read_text())
    source, source_bonds = read_molecule(root, "source.sdf", provenance)
    candidate, candidate_bonds = read_molecule(root, "unexpected-methyl-growth.sdf", provenance)
    fixed = set(provenance["fixed_atoms"])
    mapping = dict(zip(provenance["fixed_atoms"], range(len(fixed)), strict=True))
    inverse = {output: original for original, output in mapping.items()}
    # The native sampler emits fixed atoms first, in the requested order. Check
    # identities/positions before interpreting that known correspondence.
    if any(
        source[a][0] != candidate[b][0] or math.dist(source[a][1], candidate[b][1]) > 0.5
        for a, b in mapping.items()
    ):
        raise ValueError("Retained fixed-atom correspondence no longer matches this diagnostic.")
    ports = [a if a in fixed else b for a, b, _ in source_bonds if (a in fixed) != (b in fixed)]
    if ports != [0]:
        raise ValueError("The retained single-exit reference changed.")
    rows = []
    for component in components(set(range(len(candidate))) - set(inverse), candidate_bonds):
        attachments = []
        for a, b, order in candidate_bonds:
            if a in component and b in inverse:
                a, b = b, a
            if a in inverse and b in component:
                attachments.append(
                    {
                        "source_atom": inverse[a],
                        "output_atom": a,
                        "new_atom": b,
                        "bond_order": order,
                    }
                )
        rows.append(
            {
                "new_atoms": sorted(component),
                "size": len(component),
                "attachments": attachments,
                "nearest_original_exit_distance_angstrom": min(
                    math.dist(candidate[mapping[0]][1], candidate[i][1]) for i in component
                ),
            }
        )
    core_center = center([source[i] for i in sorted(fixed)])
    edit_center = center([source[i] for i in range(len(source)) if i not in fixed])
    return {
        "source_hashes_verified": True,
        "source_cut_sites": ports,
        "fixed_atoms": len(fixed),
        "added_atoms": len(candidate) - len(fixed),
        "native_new_atom_components": rows,
        "fixed_core_centroid_angstrom": core_center,
        "original_edit_region_centroid_angstrom": edit_center,
        "core_to_original_edit_centroid_distance_angstrom": math.dist(core_center, edit_center),
        "scope": (
            "Saved-coordinate graph geometry only; no generation, repair, qualification or pin."
        ),
        "method_limit": (
            "A long gap rejects unchanged-coordinate bond repair, not future regeneration."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = json.dumps(measure(), indent=2)
    if args.output:
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
