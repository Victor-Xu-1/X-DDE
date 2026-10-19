"""Read the archived optimization study and controls without scientific execution."""

import hashlib
import json

import pytest


def retained_optimization(settings, store, pins):
    pin = pins.get("diffsbdd.optimize", verify=True)
    assert str(pin.job_id) == "17c41170-372b-49bf-bb03-fa94f482ed0a"
    assert pin.review and "None of the 12 products preserves" in pin.review.limitations
    assert "worse SA heuristic" in pin.review.limitations
    primary = store.get(str(pin.job_id)).request.model_dump(mode="json")["payload"]
    assert primary["initial"] == primary["pocket"]["ligand"]
    assert primary["initial"]["version_id"] == "30fc43ca-ae27-5e35-99fc-4e2d3c142369"
    assert {key: primary["options"][key] for key in (
        "seed", "population", "rounds", "survivors", "change_steps", "relaxation"
    )} == dict(seed=2026, population=6, rounds=2, survivors=3, change_steps=20, relaxation=0)
    stages = [str(value.job_id) for value in pin.supporting_evidence]
    assert stages == [
        "98720ea6-0aae-4e45-955e-8d9e8ed4c8af", "ede1cbc1-bebe-49d9-bb04-f96798b403ee",
        "515e1ff8-5439-415a-932b-09a9ffbe795e", "884bfb5e-e324-44c6-88d4-39df4c247b8a",
        "c331adf8-affc-4f68-8d67-7d2255028ef1", "ea44deac-649b-4105-a325-abe21185444e",
        "832c6323-816d-4ca3-9a8d-4da5b90745ef",
    ]

    def output(job_id, name="result.json"):
        return settings.state_dir / "jobs" / job_id / "output" / name

    generated = json.loads(output(str(pin.job_id)).read_bytes())
    assert generated["attempted"] == generated["valid"] == 12
    assert generated["report"]["optimization"]["best_score"] == pytest.approx(.8110655257040148)
    prepared = json.loads(output(stages[0]).read_bytes())
    assert prepared["source"]["record"] == 9 and len(prepared["conformers"]) == 9
    lowest = min(prepared["conformers"], key=lambda value: value["energy"])
    assert lowest["record"] == 5 and lowest["converged"]
    assert lowest["energy"] == pytest.approx(78.19208927021864)
    assert hashlib.sha256(output(stages[0], lowest["artifact"]).read_bytes()).hexdigest() == (
        "6f3ccc08bcb622a339ed26e8234c68f53a629696ebdaf462effa4386e1b69ce3"
    )
    predicted, experimental = store.get(stages[1]), store.get(stages[4])
    assert predicted.request.ligand == experimental.request.ligand
    assert predicted.request.options == experimental.request.options
    assert predicted.request.ligand.record == 5
    assert predicted.request.receptor.sha256 != experimental.request.receptor.sha256
    quality = []
    for stage, distance in zip((stages[2], stages[3], stages[5], stages[6]),
                               (2.8004259051, 2.8758337608, 2.8287165659, 2.7759445329),
                               strict=True):
        result = json.loads(output(stage).read_bytes())
        assert result["versions"]["posebusters"] == "0.6.5"
        metrics = result["metrics"]
        assert metrics["num_pairwise_clashes_protein"] == metrics["number_clashes"] == 0
        assert metrics["number_double_bonds_checked"] == 0
        assert metrics["smallest_distance_protein"] == pytest.approx(distance, abs=1e-6)
        assert all(metrics.get(key) is None for key in (
            "smallest_distance_waters", "smallest_distance_organic_cofactors",
            "smallest_distance_inorganic_cofactors", "volume_overlap_waters",
            "volume_overlap_organic_cofactors", "volume_overlap_inorganic_cofactors"))
        quality.append(stage)
    return {"primary_job": str(pin.job_id), "supporting_stages": stages,
            "independent_quality_jobs": quality, "binding_validated": False}
