"""Source pin admission is bounded by study ownership and immutable identity."""

import json
from uuid import uuid4

import pytest

from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.bundle_pin_dependencies import source_pins


def source_row():
    module = bundle_catalogue("stat6").modules["gnina.dock"]
    job = str(uuid4())
    body = dict(
        capability_id=module.capability_id,
        case_id=module.case_id,
        revision=3,
        job_id=job,
        request_sha256="a" * 64,
        environment_sha256="b" * 64,
        artifact_sha256={"pose.sdf": "c" * 64},
        created_at="2026-10-20T00:00:00Z",
        review={
            "interpretation": "Protocol boundary fixture, not scientific inference.",
            "limitations": "Controlled records only; no scientific claim is made.",
            "checked": [
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ],
        },
    )
    return dict(capability_id=module.capability_id, revision=3, job_id=job, body=json.dumps(body))


@pytest.mark.parametrize("scope", ["foreign_study", "future_revision", "unreviewed", "unselected"])
def test_unowned_or_unreviewed_sources_are_not_dependencies(scope):
    row = source_row()
    modules = bundle_catalogue("stat6").modules
    body = json.loads(row["body"])
    if scope == "foreign_study":
        body["case_id"] = "another-research-study"
    elif scope == "future_revision":
        row["revision"] = body["revision"] = 5
    elif scope == "unreviewed":
        body["review"] = None
    row["body"] = json.dumps(body)
    assert source_pins([row], modules, set() if scope == "unselected" else {"gnina.dock"}) == {}


def test_source_pin_cannot_substitute_another_job_identity():
    row = source_row()
    row["job_id"] = str(uuid4())
    with pytest.raises(ValueError, match="stored identity"):
        source_pins([row], bundle_catalogue("stat6").modules, {"gnina.dock"})
