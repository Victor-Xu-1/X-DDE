"""Dataset display names must match the exact source job, SDF checksum and record."""

import hashlib
import json
from uuid import uuid4

import pytest
from test_example_stage_names import stages

from opendde_workbench.chemistry.minimization_contract import MoleculeMinimizeTask
from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.datasets.result import DatasetResult
from opendde_workbench.examples.supporting import supporting_stage_names
from opendde_workbench.models import Status
from opendde_workbench.quality.contract import PoseQualityTask


def dataset_stages(settings, task_type=MoleculeMinimizeTask):
    store, scientific, jobs, pin = stages(settings, task_type)
    task = DatasetTask(
        operation="library_subset",
        name="Candidate protocol fixture",
        sources=[{"job_id": uuid4(), "report_sha256": "a" * 64, "role": "library"}],
        payload={"kind": "chemistry", "mode": "subset", "selected_ids": ["protocol-member"]},
    )
    parent = store.create(task, str(uuid4()), 20, 500)
    store.claim(parent.id)
    store.finish(parent.id, Status.SUCCEEDED)
    asset = scientific.assets.get(jobs[0].request.molecule.asset_id)
    output = settings.state_dir / "jobs" / parent.id / "output"
    output.mkdir(parents=True)
    raw = scientific.assets.path(asset).read_bytes()
    (output / "candidates.sdf").write_bytes(raw)
    report = DatasetResult(
        operation=task.operation,
        program="chemistry",
        version="storage-protocol-only",
        request_sha256=hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        data_kind="screening",
        artifacts=[
            {
                "name": "candidates.sdf",
                "format": "sdf",
                "role": "unbound_candidates",
                "sha256": asset.sha256,
                "size": len(raw),
            }
        ],
        candidates=[
            {
                "id": f"internal-{record}",
                "display_name": f"Public compound {record + 1}",
                "source_job": str(uuid4()),
                "source_record": record,
                "artifact": "candidates.sdf",
                "record": record,
            }
            for record in range(len(jobs))
        ],
    ).model_dump(mode="json")
    manifest = output / "result.json"
    manifest.write_text(json.dumps(report))
    with store.connect() as db:
        db.execute(
            "UPDATE scientific_objects SET body=json_set(body,'$.source_job',?)",
            (parent.id,),
        )
    return store, scientific, jobs, pin, manifest, report


@pytest.mark.parametrize("task_type", [MoleculeMinimizeTask, PoseQualityTask])
def test_dataset_stage_captions_use_exact_public_record_names_without_rewriting_native_data(
    settings,
    task_type,
):
    store, scientific, jobs, pin, manifest, _ = dataset_stages(settings, task_type)
    before = {job.id: store.get(job.id).model_dump_json() for job in jobs}
    raw = manifest.read_bytes()
    captions = supporting_stage_names(store, pin, scientific)
    assert [captions[job.id] for job in jobs] == [
        f"Initial optimized 3D preview · Public compound {record + 1}"
        for record in range(len(jobs))
    ]
    assert {job.id: store.get(job.id).model_dump_json() for job in jobs} == before
    assert manifest.read_bytes() == raw


@pytest.mark.parametrize(
    "mismatch", ["record", "sha256", "request", "ambiguous", "control", "long"]
)
@pytest.mark.parametrize("task_type", [MoleculeMinimizeTask, PoseQualityTask])
def test_inconsistent_dataset_metadata_never_supplies_an_unrelated_caption(
    settings, mismatch, task_type
):
    store, scientific, jobs, pin, manifest, report = dataset_stages(settings, task_type)
    if mismatch == "sha256":
        report["artifacts"][0]["sha256"] = "f" * 64
    elif mismatch == "request":
        report["request_sha256"] = "f" * 64
    elif mismatch == "record":
        report["candidates"][0]["record"] = 400
    elif mismatch == "ambiguous":
        report["candidates"][1]["record"] = 0
    else:
        report["candidates"][0]["display_name"] = (
            "bad\nlabel" if mismatch == "control" else "a" * 121
        )
    manifest.write_text(json.dumps(report))
    caption = supporting_stage_names(store, pin, scientific)[jobs[0].id]
    assert "Public compound" not in caption and "bad\nlabel" not in caption
