"""Author a bounded handoff from verified study recipes, never archived demo tasks."""

from ...quality.assessment import POSE_GATE_CHECKS
from ...workflows.contracts import PlanInput
from .request_replay import reviewed_request


def study_workflow(scientific, records, *, modules):
    if records is None:
        return None
    retained = records.prepared("workflows")
    if retained is not None:
        return PlanInput.model_validate(retained["value"]["body"]).model_dump(mode="json")
    recipes = [
        reviewed_request(key, scientific, records, modules=modules)
        for key in ("gnina.dock", "posebusters.check", "properties")
    ]
    if any(recipe is None for recipe in recipes):
        return None
    docking, quality, properties = recipes
    if docking.get("operation") != "docking" or docking.get("mode") != "dock":
        raise ValueError("The study workflow requires a reviewed new-docking recipe.")
    if quality.get("operation") != "pose_quality" or quality["options"]["profile"] != "dock":
        raise ValueError("The study workflow requires a reviewed receptor-frame quality recipe.")
    if properties.get("operation") != "properties":
        raise ValueError("The study workflow requires a reviewed molecular-property recipe.")
    return PlanInput.model_validate(
        {
            "name": "STAT6 · docking, measured pose checks and molecular properties",
            "steps": [
                {"id": "dock", "request": docking},
                {
                    "id": "quality",
                    "request": quality,
                    "depends_on": ["dock"],
                    "bindings": [
                        {
                            "from_step": "dock",
                            "target": target,
                            "kind": kind,
                            "result_field": field,
                            "record": 0,
                        }
                        for target, kind, field in (
                            ("quality_molecule", "ligand", "pose_artifact"),
                            ("quality_protein", "structure", "receptor_artifact"),
                        )
                    ],
                    "quality_gate": {"required_checks": POSE_GATE_CHECKS},
                },
                {
                    "id": "properties",
                    "request": properties,
                    "depends_on": ["dock", "quality"],
                    "bindings": [
                        {
                            "from_step": "dock",
                            "target": "property_input",
                            "kind": "ligand",
                            "record": 0,
                            "result_field": "pose_artifact",
                        }
                    ],
                },
            ],
            "budget": {"max_jobs": 3, "wall_seconds": 3600},
        }
    ).model_dump(mode="json")
