"""Terminal control provenance cannot authorize failed scientific dependencies."""

import json

import pytest

from opendde_workbench.examples.bundle_jobs import validate_job_history
from opendde_workbench.examples.bundle_projection import TABLES

PARENT = "c16d6723-c8f9-436c-aaba-5777fe9a7221"
CHILD = "25f150d6-87e0-4b68-ae85-d5875dd57e51"
REQUEST = json.dumps({"operation": "doctor", "name": "Controlled protocol fixture"})


def records(status="failed"):
    rows = {name: [] for name in TABLES}
    rows["jobs"] = [
        {"id": PARENT, "status": status, "request": REQUEST, "parent_id": None},
        {"id": CHILD, "status": "succeeded", "request": REQUEST, "parent_id": PARENT},
    ]
    return rows


def test_terminal_history_is_retained_as_control_only():
    assert validate_job_history(records()) == {PARENT}


@pytest.mark.parametrize("status", ["queued", "running", "paused", "cancelling"])
def test_active_or_paused_ancestors_are_never_imported(status):
    with pytest.raises(ValueError, match="active or unfinished"):
        validate_job_history(records(status))


def test_failed_scientific_source_cannot_be_reclassified_as_retry_history():
    rows = records()
    rows["scientific_objects"] = [{"body": json.dumps({"source_job": PARENT})}]
    with pytest.raises(ValueError, match="scientific input dependency"):
        validate_job_history(rows)


def test_failed_pin_is_not_a_computed_result():
    rows = records()
    rows["example_pins"] = [{"job_id": PARENT}]
    with pytest.raises(ValueError, match="pinned result"):
        validate_job_history(rows)


def test_changed_request_is_not_the_same_retry():
    rows = records()
    rows["jobs"][0]["request"] = REQUEST.replace("Controlled", "Different")
    with pytest.raises(ValueError, match="exact same request"):
        validate_job_history(rows)


def test_unrelated_terminal_task_is_not_exported():
    rows = records()
    rows["jobs"][1]["parent_id"] = None
    with pytest.raises(ValueError, match="Only terminal ancestors"):
        validate_job_history(rows)


def test_retry_cycle_is_rejected():
    rows = records()
    rows["jobs"][0]["parent_id"] = CHILD
    with pytest.raises(ValueError, match="cyclic"):
        validate_job_history(rows)
