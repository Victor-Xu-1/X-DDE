"""Controlled report transport fixture, never a scientific inference result."""

import hashlib
import json
from uuid import uuid4

from opendde_workbench.quality.assessment import POSE_GATE_CHECKS
from opendde_workbench.quality.contract import PoseQualityTask
from opendde_workbench.quality.manifest import CHECKS, CONFIG_DIGESTS


def reference(raw=b"controlled\n"):
    return {"asset_id": str(uuid4()), "sha256": hashlib.sha256(raw).hexdigest()}


def quality_task(assets=None):
    molecule, protein = reference(), reference()
    if assets is not None:
        molecule, protein = [
            {"asset_id": str(asset.id), "sha256": asset.sha256}
            for asset in (
                assets.save("controlled.sdf", "ligand", b"controlled\n"),
                assets.save("controlled.pdb", "structure", b"controlled\n"),
            )
        ]
    return PoseQualityTask(
        molecule=molecule,
        protein=protein,
        scientific_inputs=[molecule, protein],
        options={"profile": "dock"},
        coordinate_basis="user_confirmed",
    )


def quality_plan(task, *, downstream=True):
    from opendde_workbench.workflows.contracts import PlanInput

    steps = [
        {
            "id": "quality",
            "request": task.model_dump(mode="json"),
            "quality_gate": {"required_checks": POSE_GATE_CHECKS},
        }
    ]
    if downstream:
        steps.append(
            {
                "id": "properties",
                "depends_on": ["quality"],
                "request": {
                    "operation": "properties",
                    "name": "Controlled descriptors",
                    "smiles": ["CCN"],
                },
            }
        )
    return PlanInput.model_validate({"name": "Controlled gate fixture", "steps": steps})


def report(task, output):
    output.mkdir(parents=True)
    assets = output.parent / "assets"
    assets.mkdir()
    previews = {}
    for role in ("molecule", "protein"):
        ref = getattr(task, role)
        suffix = ".sdf" if role == "molecule" else ".pdb"
        raw = b"controlled\n"
        (assets / (str(ref.asset_id) + suffix)).write_bytes(raw)
        preview = raw + b"\n$$$$\n" if role == "molecule" else raw
        name = role + "-preview" + suffix
        (output / name).write_bytes(preview)
        previews[name] = hashlib.sha256(preview).hexdigest()
    return {
        "operation": "pose_quality",
        "complete": True,
        "schema_version": 1,
        "inputs": {
            role: getattr(task, role).model_dump(mode="json") for role in ("molecule", "protein")
        },
        "options": task.options.model_dump(mode="json"),
        "coordinate_basis": "user_confirmed",
        "classification": "passes",
        "checks": [{"id": key, "outcome": "pass"} for key in CHECKS["dock"]],
        "metrics": {
            "number_bonds": 2,
            "number_angles": 1,
            "number_noncov_pairs": 1,
            "number_aromatic_rings_checked": 0,
            "number_non-aromatic_rings_checked": 0,
            "number_double_bonds_checked": 0,
            "smallest_distance_protein": 2.8,
            "volume_overlap_protein": 0.0,
        },
        "versions": {
            "posebusters": "0.6.5",
            "rdkit": "2025.9.5",
            "numpy": "2.2.6",
            "pandas": "2.3.3",
        },
        "native_config_sha256": CONFIG_DIGESTS["dock"],
        "previews_sha256": previews,
        "scope": "native_pose_plausibility_not_binding_affinity_or_experimental_validation",
    }


def write_report(output, value):
    (output / "result.json").write_text(json.dumps(value), encoding="utf-8")
