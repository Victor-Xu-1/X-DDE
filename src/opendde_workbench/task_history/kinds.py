"""Project the reviewed capability catalogue into request classification rules."""

from ..capabilities.definitions import CAPABILITIES

DISCRIMINATORS = {
    "harness": "tool",
    "diffsbdd": "payload.mode",
    "docking": "mode",
    "target_research": "entity",
}


def task_kind_rules() -> list[dict]:
    rules = []
    for spec in CAPABILITIES.values():
        for operation in spec.operations:
            field = DISCRIMINATORS.get(operation)
            value = spec.native_tool if operation == "harness" else spec.native_mode
            rules.append({"id": spec.id, "operation": operation, "field": field, "value": value})
    # Saved-pose optimization is a typed task created inside the molecular viewer,
    # without a separate capability card. Its history still needs a meaningful type.
    rules.append(
        {"id": "pose.minimize", "operation": "molecule_minimize", "field": None, "value": None}
    )
    # Historical Harness snapshots remain readable under their original module.
    rules.append({"id": "structure", "operation": "harness", "field": "tool", "value": "structure"})
    rules.append({"id": "rmsd", "operation": "harness", "field": "tool", "value": "rmsd"})
    return rules


def classify_request(request: dict) -> str:
    operation = request.get("operation") or "predict"
    for rule in task_kind_rules():
        if operation != rule["operation"]:
            continue
        value = request
        if rule["field"]:
            for key in rule["field"].split("."):
                value = value.get(key) if isinstance(value, dict) else None
            if value != rule["value"]:
                continue
        return rule["id"]
    return "other"


def classification_sql() -> tuple[str, list[str]]:
    clauses, parameters = [], []
    for rule in task_kind_rules():
        clause = "COALESCE(json_extract(j.request, '$.operation'), 'predict') = ?"
        parameters.append(rule["operation"])
        if rule["field"]:
            # Paths come only from DISCRIMINATORS, never from a caller.
            clause += f" AND json_extract(j.request, '$.{rule['field']}') = ?"
            parameters.append(rule["value"])
        clauses.append("WHEN " + clause + " THEN ?")
        parameters.append(rule["id"])
    return "CASE " + " ".join(clauses) + " ELSE 'other' END", parameters
