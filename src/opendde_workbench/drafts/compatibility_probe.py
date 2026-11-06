"""Isolated target-wheel schema reader; no application, queue or scientific startup."""

import json
import sys
from copy import deepcopy
from pathlib import Path


def preserved(original, decoded):
    """Allow canonical absent optional nulls, but no lost or coerced research values."""
    if isinstance(original, dict):
        return (
            isinstance(decoded, dict)
            and all(
                key in decoded and preserved(value, decoded[key]) for key, value in original.items()
            )
            and all(decoded[key] is None for key in decoded.keys() - original.keys())
        )
    if isinstance(original, list):
        return (
            isinstance(decoded, list)
            and len(original) == len(decoded)
            and all(preserved(left, right) for left, right in zip(original, decoded, strict=True))
        )
    if type(original) in {int, float}:
        return type(decoded) in {int, float} and original == decoded
    return type(original) is type(decoded) and original == decoded


def validate_row(row, validator):
    body = json.loads(row["body"])
    if set(body) != {"tool", "schema_version", "state"} or validator is None:
        raise ValueError("No compatible target draft schema.")
    # Target before-validators may mutate their input. Never compare against that
    # same object after validation, or a lossy normalization could approve itself.
    original = deepcopy(body["state"])
    decoded = validator(
        {
            **body,
            "id": row["id"],
            "revision": row["revision"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived": bool(row["archived"]),
            "name": original["name"],
            "entities": len(original["components"]),
        }
    )
    if not preserved(original, decoded.state.model_dump(mode="json")):
        raise ValueError("The target changed stored research input values.")


def main():
    target = Path(sys.argv[1]).resolve(strict=True)
    sys.path.insert(0, str(target))
    try:
        import opendde_workbench.drafts.models as models

        if not Path(models.__file__).is_relative_to(target):
            raise ValueError("The target schema was not loaded from the verified wheel.")
        validator = models.Draft.model_validate
    except (ImportError, ValueError, AttributeError):
        validator = None
    total, rejected, examples = 0, 0, []
    for line in sys.stdin.buffer:
        total += 1
        row = json.loads(line)
        try:
            validate_row(row, validator)
        except (ValueError, TypeError, KeyError):
            rejected += 1
            if len(examples) < 32:
                # No scientific inputs, names or validation-error payloads leave the child.
                examples.append({"id": str(row["id"])[:80], "reason": "target_schema_rejected"})
    print(json.dumps({"drafts": total, "rejected": rejected, "examples": examples}))


if __name__ == "__main__":
    main()
