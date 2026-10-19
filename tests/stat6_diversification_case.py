"""Assertions for retained real cases; this module never performs scientific inference."""

import json


def retained_diversification(settings, store, pins):
    pin = pins.get("diffsbdd.diversify", verify=True)
    assert str(pin.job_id) == "59348536-7349-42a0-95ae-e76a7e07e78d"
    assert pin.review and "not a validated hit-finding campaign" in pin.review.limitations
    stages = [str(value.job_id) for value in pin.supporting_evidence]
    assert stages == [
        "2f0d7c91-de44-49e9-b839-c352667f2c31", "18fe1caa-401b-4bed-a704-31874deec47b",
        "936b1612-1502-47bf-aa30-555d239f580e", "4949ff4c-17f0-4fd6-84fe-e1fc4f460778",
        "2899703f-0bfd-46ba-85e6-5fec7a072610", "7028c808-67aa-4957-8d45-bb3dfbd26eb6",
    ]
    predicted, experimental = store.get(stages[1]), store.get(stages[4])
    assert predicted.request.ligand == experimental.request.ligand
    assert predicted.request.options == experimental.request.options
    assert predicted.request.receptor.sha256 != experimental.request.receptor.sha256
    assert predicted.request.options.cpu == 1 and not predicted.request.options.use_gpu
    assert predicted.request.options.exhaustiveness == 16
    assert predicted.request.options.num_modes == 20 and predicted.request.options.seed == 2026
    assert predicted.request.ligand.record == 2
    quality = []
    for stage in (stages[2], stages[3], stages[5]):
        job = store.get(stage)
        assert job.status == "succeeded" and job.request.operation == "pose_quality"
        output = settings.state_dir / "jobs" / stage / "output"
        result = json.loads((output / "result.json").read_bytes())
        assert result["versions"]["posebusters"] == "0.6.5"
        assert result["metrics"]["num_pairwise_clashes_protein"] == 0
        assert result["metrics"]["number_clashes"] == 0
        assert result["metrics"]["number_double_bonds_checked"] == 0
        assert all(result["metrics"].get(metric) is None for metric in (
            "smallest_distance_waters", "smallest_distance_organic_cofactors",
            "smallest_distance_inorganic_cofactors", "volume_overlap_waters",
            "volume_overlap_organic_cofactors", "volume_overlap_inorganic_cofactors"))
        quality.append(stage)
    return {"primary_job": str(pin.job_id), "supporting_stages": stages,
            "independent_quality_jobs": quality, "binding_validated": False}
