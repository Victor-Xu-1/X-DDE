"""Collections of actual inverse-folded proposals; no invented parent fitness."""

import json
import math
from uuid import UUID, uuid5

from ..artifacts import contained
from ..research.contracts import VersionInput
from .pins import ExamplePins

NAMESPACE = UUID("601ff02d-82e8-411e-a853-68dfb6c7a811")


def proposal_populations(scientific, state, sequences):
    pin = ExamplePins(scientific.store, state).get("mpnn", verify=True)
    if not pin:
        return {}
    job = scientific.store.get(str(pin.job_id))
    expected = {"B": sequences["heavy"], "A": sequences["light"]}
    if job.request.payload["parent_chains"] != expected:
        raise ValueError("Proposal example refers to another antibody sequence.")
    output = state / "jobs" / str(pin.job_id) / "output"
    native = json.loads(contained(output, "result.json").read_text())["result"]["candidates"]
    if not 2 <= len(native) <= 32:
        raise ValueError("The proposal collection requires retained native candidates.")
    candidates = []
    for index, raw in enumerate(native):
        scores = raw["metadata"]["soluble_mpnn_scores"]
        if set(scores) != set(expected) or any(
            not math.isfinite(value) for value in scores.values()
        ):
            raise ValueError("Proposal example has missing native sequence scores.")
        loss = sum(scores.values()) / len(scores)
        mutations = [
            {"chain_id": chain, "position": position, "from_aa": before, "to_aa": after}
            for chain, parent in expected.items()
            for position, (before, after) in enumerate(
                zip(parent, raw["chains"][chain], strict=True)
            )
            if before != after
        ]
        candidates.append(
            {
                **raw,
                "candidate_id": f"mpnn-proposal-{index + 1:03}",
                "parent_id": "trastuzumab-1N8Z",
                "objective": loss,
                "metrics": {"loss": loss},
                "mutations": mutations,
                "metadata": {
                    **raw["metadata"],
                    "cycle": 1,
                    "objective_definition": (
                        "Mean native per-chain SolubleMPNN negative log probability "
                        "over designed residues; not binding fitness"
                    ),
                    "source_job": str(pin.job_id),
                },
            }
        )
    parent = {
        "candidate_id": "trastuzumab-1N8Z",
        "chains": expected,
        "sequence": "".join(expected.values()),
        "metrics": {},
        "metadata": {"cycle": 0, "score_available": False},
    }
    result = {}
    for key, records in (
        ("proposal_history", [parent, *candidates]),
        ("proposal_reference", candidates[:2]),
        ("proposal_current", candidates),
    ):
        body = {
            "candidates": records,
            "scope": (
                "Real native proposals from one batch; first-two subset versus all four; "
                "parent fitness is unmeasured"
            ),
            "source_job": str(pin.job_id),
        }
        asset = scientific.assets.save(
            key + ".json", "config", json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        )
        result[key] = scientific.create(
            VersionInput(
                asset_id=asset.id,
                kind="analysis",
                label="Trastuzumab · " + key,
                notes=(
                    "Source: verified native MPNN case. Aggregate loss is a sequence-model "
                    "metric, not affinity or measured activity."
                ),
            ),
            uuid5(NAMESPACE, key + ":" + asset.sha256),
            source_job=pin.job_id,
            validation="native_generated",
        )
    return result
