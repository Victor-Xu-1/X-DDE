"""A real docking-to-descriptor handoff in the existing research-plan contract."""

from ..workflows.contracts import PlanInput


def example_workflow(objects):
    receptor = objects.get("receptor")
    ligand = objects.get("jq1")
    if not receptor or not ligand:
        return None
    protein = receptor.reference.model_dump(mode="json")
    molecule = ligand.reference.model_dump(mode="json")
    return PlanInput.model_validate(
        {
            "name": "BRD4–JQ1 · 对接姿势复用到性质计算",
            "budget": {"max_jobs": 2, "wall_seconds": 3600},
            "steps": [
                {
                    "id": "dock",
                    "request": {
                        "operation": "docking",
                        "mode": "dock",
                        "name": "BRD4–JQ1 · native docking",
                        "receptor": protein,
                        "ligand": molecule,
                        "search": {
                            "kind": "reference_ligand",
                            "frame": protein,
                            "reference": molecule,
                            "coordinate_basis": "user_confirmed",
                        },
                        "options": {
                            "cpu": 2,
                            "cnn_scoring": "none",
                            "exhaustiveness": 8,
                            "num_modes": 5,
                        },
                    },
                },
                {
                    "id": "describe",
                    "depends_on": ["dock"],
                    "request": {
                        "operation": "properties",
                        "name": "Docked candidate · native descriptors",
                        "ligand_files": [molecule["asset_id"]],
                    },
                    "bindings": [
                        {
                            "from_step": "dock",
                            "result_field": "pose_artifact",
                            "kind": "ligand",
                            "record": 0,
                            "target": "property_input",
                        }
                    ],
                },
            ],
        }
    ).model_dump(mode="json")
