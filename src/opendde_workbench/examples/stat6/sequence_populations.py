"""Reproducible hypothesis cohorts from actually scored STAT6 sequences."""

import json
import math
from uuid import UUID, uuid5

from ...artifacts import contained
from ...research.contracts import VersionInput
from ..pins import ExamplePins

NAMESPACE = UUID("a3c2132b-f14f-465e-b9ca-6c1def436663")


def reviewed_sequence_populations(scientific, records, canonical):
    if records is None:
        return {}
    pin = ExamplePins(scientific.store, records.settings.state_dir, modules=records.modules).get(
        "esm", verify=True
    )
    if pin is None or pin.review is None:
        return {}
    job = scientific.store.get(str(pin.job_id))
    if job.request.operation != "harness" or job.request.tool != "esm":
        raise ValueError("Sequence cohorts require a reviewed native sequence-score task.")
    sequences = job.request.payload["sequences"]
    output = records.settings.state_dir / "jobs" / str(pin.job_id) / "output"
    result = json.loads(contained(output, "result.json").read_text(encoding="utf-8"))
    scores = result["result"]["scores"]
    if (
        not 3 <= len(sequences) <= 32
        or len(scores) != len(sequences)
        or sequences[0] != canonical
        or len(set(sequences)) != len(sequences)
    ):
        raise ValueError("Use a scored canonical parent and at least two distinct hypotheses.")
    candidates = []
    for index, (sequence, score) in enumerate(zip(sequences, scores, strict=True)):
        if (
            len(sequence) != len(canonical)
            or type(score) not in {int, float}
            or not math.isfinite(score)
        ):
            raise ValueError("Every sequence must retain its exact finite native score.")
        substitutions = [
            f"A:{before}{position}{after}"
            for position, (before, after) in enumerate(zip(canonical, sequence, strict=True), 1)
            if before != after
        ]
        if index and len(substitutions) != 1:
            raise ValueError("Each reviewed hypothesis must be one explicit substitution.")
        candidate = {
            "candidate_id": "STAT6-WT"
            if index == 0
            else "STAT6-" + substitutions[0].removeprefix("A:"),
            "sequence": sequence,
            "chains": {"A": sequence},
            "mutations": substitutions,
            "objective": -score,
            "metrics": {"loss": -score, "esm2_pll": score},
            "metadata": {
                "cycle": int(index > 0),
                "source_job": str(pin.job_id),
                "source_sequence_index": index,
                "objective_definition": (
                    "Negative native mean ESM2 pseudo-log-likelihood; "
                    "not affinity, activity or measured fitness."
                ),
                "fold_evaluated": False,
            },
        }
        if index:
            candidate["parent_id"] = "STAT6-WT"
        candidates.append(candidate)
    scope = (
        "Explicit single-site hypotheses scored in one native batch, "
        "not a completed optimization campaign. "
        "Reference cohort uses the scored parent and first hypothesis; "
        "comparison cohort uses the same parent and remaining hypotheses. "
        "Parent score is computed by the same sequence model. "
        "No fold, affinity, resistance or experimental activity is inferred."
    )
    objects = {}
    for key, values in (
        ("proposal_history", candidates),
        ("proposal_reference", candidates[:2]),
        ("proposal_current", [candidates[0], *candidates[2:]]),
    ):
        content = json.dumps(
            {"candidates": values, "scope": scope, "source_job": str(pin.job_id)},
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
        ).encode()
        asset = scientific.assets.save("STAT6-" + key + ".json", "config", content)
        objects[key] = scientific.create(
            VersionInput(
                asset_id=asset.id,
                kind="analysis",
                label="STAT6 · " + key,
                notes="Curated from a verified native score result. " + scope,
            ),
            uuid5(NAMESPACE, key + ":" + asset.sha256),
            source_job=pin.job_id,
        )
    return objects
