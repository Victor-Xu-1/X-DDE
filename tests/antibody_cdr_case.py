"""Replay frozen native numbering in an isolated store; never run or fabricate inference."""

import json
from pathlib import Path
from uuid import uuid4

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store

FIXTURE = Path(__file__).parent / "fixtures/stat6/antibody_cdr"


def numbering_case(settings, *, reviewed=True, mutate=None):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    prepared = prepare_stat6("antibody.number", scientific, records=records)
    request = TASK_ADAPTER.validate_python(prepared.request)
    report = json.loads((FIXTURE / "result.json").read_text())
    # Only the isolated transport UUIDs change. The frozen native sequence,
    # residue positions, region labels, scores and FASTA artifacts stay exact.
    assert report["source"]["sha256"] == request.sequences.sha256
    assert report["options"] == request.options.model_dump(mode="json")
    report["source"] = request.sequences.model_dump(mode="json")
    if mutate:
        mutate(report)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for name in ("domain-000.fasta", "domain-001.fasta"):
        (output / name).write_bytes((FIXTURE / name).read_bytes())
    (output / "result.json").write_text(json.dumps(report), encoding="utf-8")
    store.bind_environment(job.id, capture(settings, "anarcii"))
    store.finish(job.id, Status.SUCCEEDED)
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).pin(
        "antibody.number",
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Replay of frozen native ANARCII 2.0.8 numbering for input contracts.",
            limitations=(
                "Transport UUIDs rebound in isolated state; no new inference or binding claim."
            ),
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        )
        if reviewed
        else None,
    )
    return scientific, records, prepared, job, pin
