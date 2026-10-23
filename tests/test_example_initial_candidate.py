"""A reviewed opening view never edits native ranks, scores or scientific files."""

import hashlib
import json
from uuid import uuid4

import pytest
from native_case_inputs_fixture import stores

from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.store import ConflictError


def native_case(settings):
    store, scientific, records = stores(settings)
    prepared = prepare_stat6("boltz.predict", scientific, records=records)
    request = TASK_ADAPTER.validate_python(prepared.request)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    names = ["structure-001", "structure-002", "structure-003"]
    files = {}
    for identifier in names:
        data = b"sealed native transport fixture; not a computed structure\n"
        (output / (identifier + ".cif")).write_bytes(data)
        files[identifier + ".cif"] = hashlib.sha256(data).hexdigest()
    result = {
        "operation": request.operation,
        "program": "boltz",
        "version": "2.2.1",
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
        "artifact_sha256": files,
        "candidates": [
            {"id": identifier, "artifact": identifier + ".cif", "metrics": []}
            for identifier in names
        ],
    }
    (output / "result.json").write_text(json.dumps(result))
    store.bind_environment(job.id, capture(settings, "boltz"))
    store.finish(job.id, Status.SUCCEEDED)
    review = ExampleReview(
        interpretation="Sealed presentation contract fixture, not scientific acceptance.",
        limitations="Selecting a view does not alter the native candidates or their ranking.",
        checked=("input_identity", "method_scope", "native_outputs", "visual_preview", "downloads"),
    )
    return ExamplePins(store, settings.state_dir, modules=MODULES), prepared, job, output, review


def test_reviewed_candidate_is_exact_and_immutable_without_reranking(settings):
    pins, prepared, job, output, review = native_case(settings)
    original = {file.name: file.read_bytes() for file in output.iterdir()}
    pin = pins.pin(
        "boltz.predict", job.id, prepared, review=review, initial_candidate_id="structure-003"
    )
    assert pin.initial_candidate_id == "structure-003"
    assert pins.get("boltz.predict", verify=True) == pin
    assert (
        pins.pin(
            "boltz.predict", job.id, prepared, review=review, initial_candidate_id="structure-003"
        )
        == pin
    )
    with pytest.raises(ConflictError, match="immutable"):
        pins.pin(
            "boltz.predict", job.id, prepared, review=review, initial_candidate_id="structure-002"
        )
    assert original == {file.name: file.read_bytes() for file in output.iterdir()}
    assert [
        row["id"] for row in json.loads((output / "result.json").read_text())["candidates"]
    ] == ["structure-001", "structure-002", "structure-003"]


def test_unreviewed_or_nonexistent_initial_candidate_cannot_be_fixed(settings):
    pins, prepared, job, _, review = native_case(settings)
    with pytest.raises(ValueError, match="explicit example review"):
        pins.pin("boltz.predict", job.id, prepared, initial_candidate_id="structure-003")
    with pytest.raises(ValueError, match="absent"):
        pins.pin("boltz.predict", job.id, prepared, review=review, initial_candidate_id="invented")
    assert pins.get("boltz.predict") is None


def test_reviewed_view_never_hides_changed_native_scientific_bytes(settings):
    pins, prepared, job, output, review = native_case(settings)
    pins.pin("boltz.predict", job.id, prepared, review=review, initial_candidate_id="structure-003")
    (output / "structure-001.cif").write_text("changed even though this is not the initial view")
    with pytest.raises(ValueError, match="changed"):
        pins.get("boltz.predict", verify=True)
