"""One score-completeness contract shared by frozen native execution and the host."""

import math
import re

SCORE_FIELDS = (
    ("minimizedAffinity", "kcal/mol", "lower"),
    ("CNNscore", "model_output", "higher"),
    ("CNNaffinity", "model_output", "higher"),
)


def required_score_names(cnn_scoring):
    if cnn_scoring not in {"none", "rescore", "refinement", "all"}:
        raise ValueError("Unsupported neural scoring stage.")
    return tuple(
        field[0] for field in (SCORE_FIELDS[:1] if cnn_scoring == "none" else SCORE_FIELDS)
    )


def require_score_names(names, cnn_scoring):
    names = tuple(names)
    required = required_score_names(cnn_scoring)
    if len(names) != len(required) or set(names) != set(required):
        raise ValueError("Native result is missing or conflicts with requested scoring outputs.")


def score(name, value, unit, direction):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Native score is not finite.")
    return {"name": name, "value": number, "unit": unit, "direction": direction}


def molecule_scores(molecule, cnn_scoring):
    required = required_score_names(cnn_scoring)
    if any(not molecule.HasProp(name) for name in required):
        raise ValueError("Native pose is missing requested scoring outputs.")
    return [
        score(name, molecule.GetProp(name), unit, direction)
        for name, unit, direction in SCORE_FIELDS
        if name in required
    ]


def select_pose(poses, cnn_scoring):
    """Retain GNINA's requested pose-ranking method; ties keep native order."""
    valid = [pose for pose in poses if pose["valid"]]
    if not valid:
        raise ValueError("No qualified native pose is available for selection.")
    metric = "minimizedAffinity" if cnn_scoring == "none" else "CNNscore"

    def order(pose):
        require_score_names((entry["name"] for entry in pose["scores"]), cnn_scoring)
        value = next(entry["value"] for entry in pose["scores"] if entry["name"] == metric)
        if not math.isfinite(value):
            raise ValueError("Native pose-selection score is not finite.")
        return value if cnn_scoring == "none" else -value

    return min(valid, key=order)


def parse_score_only(text, cnn_scoring):
    values = []
    required = required_score_names(cnn_scoring)
    for name, unit, direction in SCORE_FIELDS:
        if name not in required:
            continue
        native_name = "Affinity" if name == "minimizedAffinity" else name
        matches = re.findall(r"^" + native_name + r":\s*(\S+)", text, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError("Native output requires exactly one value for each requested score.")
        values.append(score(name, matches[0], unit, direction))
    return values
