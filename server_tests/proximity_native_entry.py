"""Native positive/negative chemical checks plus actual X-DDE scientific entry."""

import json
import runpy
import sys
from copy import deepcopy
from pathlib import Path

import numpy as np

sys.path.insert(0, "/platform")
from native_proximity_chemistry import arm_mapping, fragment_from_indices, read_chemistry
from native_proximity_partners import read_partner, validate_bound_arm
from native_proximity_quality import check_candidate, stereochemistry_preserved

request = json.loads(Path("/input/request.json").read_text())
full, indices, arms = read_chemistry(request)
partners = [read_partner(request, role) for role in ("a", "b")]
for index, (arm, _) in enumerate(arms):
    validate_bound_arm(arm, partners[index])
checks = []


def reject(name, operation):
    try:
        operation()
    except ValueError:
        checks.append(name)
        return
    raise AssertionError("Negative scientific input was accepted: " + name)


reject("disconnected_region", lambda: fragment_from_indices(full, indices, [0, 42, 68]))
reject(
    "incorrect_atom_map",
    lambda: arm_mapping(
        full,
        arms[0][0],
        indices,
        list(reversed(arms[0][1])),
    ),
)
wrong_frame = deepcopy(arms[0][0])
for atom in range(wrong_frame.GetNumAtoms()):
    p = wrong_frame.GetConformer().GetAtomPosition(atom)
    wrong_frame.GetConformer().SetAtomPosition(atom, [p.x + 500, p.y, p.z])
reject("binary_coordinate_frame_mismatch", lambda: validate_bound_arm(wrong_frame, partners[0]))
identity = {"rotation": np.eye(3), "translation": np.zeros((1, 3))}
original = check_candidate(full, deepcopy(full), arms, partners, identity)
if original["bond_violations"] or not original["stereochemistry_preserved"]:
    raise AssertionError("The actual source graph/3D stereochemistry positive control failed.")
collapsed = deepcopy(full)
for atom in range(collapsed.GetNumAtoms()):
    collapsed.GetConformer().SetAtomPosition(atom, [0.0, 0.0, 0.0])
bad = check_candidate(full, collapsed, arms, partners, identity)
if bad["accepted"] or not bad["bond_violations"] or not bad["intramolecular_severe_pairs"]:
    raise AssertionError("Collapsed full-molecule coordinates passed independent checks.")
checks.append("collapsed_geometry_rejected")
mirror = deepcopy(full)
for atom in range(mirror.GetNumAtoms()):
    p = mirror.GetConformer().GetAtomPosition(atom)
    mirror.GetConformer().SetAtomPosition(atom, [-p.x, p.y, p.z])
if stereochemistry_preserved(full, mirror):
    raise AssertionError("Inverted source-defined 3D stereochemistry was accepted.")
checks.append("inverted_stereochemistry_rejected")
runpy.run_path("/platform/runner.py", run_name="__main__")
Path("/output/native-checks.json").write_text(
    json.dumps(
        {
            "positive_full_graph_checked": True,
            "source_crystal_geometry": original,
            "negative_checks": checks,
            "native_model_executed": True,
        },
        indent=2,
    )
)
