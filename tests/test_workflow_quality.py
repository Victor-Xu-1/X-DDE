"""Measured gates, real SQLite lifecycle, sealed bytes and legacy wire compatibility."""

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from quality_workflow_case import quality_plan, quality_task, report, write_report

from opendde_workbench.models import Status
from opendde_workbench.quality.assessment import assess_checks
from opendde_workbench.quality.result import PoseQualityResult
from opendde_workbench.store import Store
from opendde_workbench.workflows.contracts import PlanInput
from opendde_workbench.workflows.service import WorkflowService
from opendde_workbench.workflows.storage import WorkflowRecords


@pytest.mark.parametrize(
    "condition,expected",
    [
        ("measured", "running"),
        ("missing", "failed"),
        ("native_fail", "failed"),
        ("native_unavailable", "failed"),
        ("empty_feature", "failed"),
        ("tampered_preview", "blocked"),
        ("invalid_report", "blocked"),
        ("boolean_metric", "blocked"),
    ],
)
@pytest.mark.parametrize("downstream", [True, False])
def test_gate_controls_real_persisted_dispatch_without_changing_native_success(
    settings, condition, expected, downstream
):
    settings.state_dir.mkdir(parents=True)
    store = Store(settings.state_dir / "jobs.sqlite3")
    records = WorkflowRecords(store)
    task = quality_task()
    plan = records.save_plan(quality_plan(task, downstream=downstream), uuid4())
    run = records.start(plan["id"], plan["sha256"], uuid4())
    job = records.enqueue(run["id"], "quality", task, 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    value = report(task, output)
    if condition == "missing":
        value["metrics"].pop("smallest_distance_protein")
    elif condition == "empty_feature":
        value["metrics"]["number_bonds"] = 0
    elif condition in {"native_fail", "native_unavailable"}:
        value["checks"][0]["outcome"] = "fail" if condition == "native_fail" else "unavailable"
        value["classification"] = "fails" if condition == "native_fail" else "incomplete"
    elif condition == "invalid_report":
        value["checks"].pop()
    elif condition == "boolean_metric":
        value["metrics"]["volume_overlap_protein"] = True
    elif condition == "tampered_preview":
        (output / "protein-preview.pdb").write_bytes(b"changed")
    write_report(output, value)
    store.finish(job.id, Status.SUCCEEDED)
    calls = []

    async def preflight(request):
        calls.append(request)

    worker = SimpleNamespace(error=None, outputs=None)
    asyncio.run(WorkflowService(records, worker, preflight, settings).tick())
    observed = records.run(run["id"])
    if not downstream and expected == "running":
        expected = "succeeded"
    assert observed["state"] == expected
    assert store.get(job.id).status == "succeeded"
    assert len(observed["attempts"]) == (2 if expected == "running" else 1)
    assert len(calls) == (1 if expected == "running" else 0)
    if expected not in {"running", "succeeded"}:
        assert observed["reason"]
        asyncio.run(WorkflowService(records, worker, preflight, settings).tick())
        assert records.run(run["id"]) == observed  # no quality retries or duplicate jobs


def test_quality_accounting_preserves_unknown_context_and_inapplicable_features(tmp_path):
    task = quality_task()
    value = report(task, tmp_path / "job" / "output")
    native = PoseQualityResult.model_validate(value)
    checks = {row["id"]: row for row in assess_checks(native)}
    assert checks["minimum_distance_to_waters"]["assessment"] == "unassessed"
    assert checks["double_bond_flatness"]["assessment"] == "not_applicable"
    assert checks["minimum_distance_to_protein"]["assessment"] == "pass"
    assert all(row.outcome == "pass" for row in native.checks)
    for bad in (True, "2.8", float("nan"), float("inf")):
        with pytest.raises(ValidationError):
            PoseQualityResult.model_validate(
                {**value, "metrics": {"smallest_distance_protein": bad}}
            )


def test_gate_contract_rejects_wrong_tasks_checks_and_preserves_legacy_serialization():
    value = quality_plan(quality_task()).model_dump(mode="json")
    assert "quality_gate" not in value["steps"][1]
    original = PlanInput.model_validate(
        {"name": "Legacy", "steps": [value["steps"][1] | {"depends_on": []}]}
    )
    assert "quality_gate" not in original.model_dump_json()
    for gate in (
        {"required_checks": []},
        {"required_checks": ["sanitization", "sanitization"]},
        {"required_checks": ["invented_affinity"]},
    ):
        with pytest.raises(ValidationError):
            PlanInput.model_validate(
                {**value, "steps": [{**value["steps"][0], "quality_gate": gate}]}
            )
    with pytest.raises(ValidationError):
        PlanInput.model_validate(
            {
                **value,
                "steps": [
                    {
                        **value["steps"][1],
                        "depends_on": [],
                        "quality_gate": value["steps"][0]["quality_gate"],
                    }
                ],
            }
        )


def test_ci_scope_routes_only_exact_quality_workflow_consumers():
    import runpy

    select = runpy.run_path("scripts/workflow-quality-scope.py")["selected"]
    changed = ["src/opendde_workbench/workflows/service.py", "frontend/src/quality/generated.ts"]
    assert select(changed)
    assert not select([])
    assert not select(["frontend/src/quality/generated.ts"])
    assert not select(changed + ["src/opendde_workbench/worker.py"])
    assert not select(changed + ["src/opendde_workbench/workflows/storage.py"])
