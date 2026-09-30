"""Research orchestration is a hook in the sole Worker, not a second consumer."""

from datetime import UTC, datetime

from ..models import TERMINAL
from ..store import CapacityError, ConflictError
from .bindings import resolve
from .contracts import PlanInput


class WorkflowService:
    def __init__(self, records, worker, preflight, settings):
        self.records, self.worker, self.preflight, self.settings = (
            records,
            worker,
            preflight,
            settings,
        )

    def active_attempts(self, run):
        return [a for a in run["attempts"] if a["status"] not in TERMINAL]

    def cancel(self, identifier):
        run = self.records.run(identifier)
        active = self.active_attempts(run)
        for attempt in active:
            job = self.records.store.get(attempt["job_id"])
            if (
                job
                and job.status == "running"
                and job.request.operation == "harness"
                and job.request.tool != "fold"
            ):
                raise ConflictError(
                    "A synchronous native tool is still active. Cancel after it finishes."
                )
        self.records.change(
            str(identifier), "cancelling", expected={"running", "paused", "blocked", "cancelling"}
        )
        for attempt in active:
            self.records.store.cancel(attempt["job_id"])
        return self.records.run(identifier)

    def update(self, identifier, state, reason=None, expected=None):
        return self.records.change(identifier, state, reason, expected or {"running"}, strict=False)

    def enforce_budget(self, run, plan):
        elapsed = (datetime.now(UTC) - datetime.fromisoformat(run["created_at"])).total_seconds()
        if elapsed <= plan.budget.wall_seconds:
            return False
        try:
            self.cancel(run["id"])
        except ConflictError:
            self.update(
                run["id"], "blocked", "Wall budget reached; native synchronous call still active."
            )
        return True

    async def check_running_budgets(self):
        for run in self.records.runs({"running"}, limit=100):
            plan = PlanInput.model_validate(self.records.plan(run["plan_id"])["body"])
            self.enforce_budget(run, plan)

    async def tick(self):
        if self.records.store.queue_halt() or self.worker.error:
            return
        for run in self.records.runs({"running", "cancelling"}, limit=100):
            if run["state"] == "cancelling":
                if not self.active_attempts(run):
                    self.update(run["id"], "cancelled", expected={"cancelling"})
                continue
            plan = PlanInput.model_validate(self.records.plan(run["plan_id"])["body"])
            if self.enforce_budget(run, plan):
                continue
            if any(attempt["status"] == "missing" for attempt in run["attempts"]):
                self.update(
                    run["id"], "blocked", "A task record is missing. Restore it from backup."
                )
                continue
            latest = {a["step_id"]: a for a in run["attempts"]}
            if all(
                step.id in latest and latest[step.id]["status"] == "succeeded"
                for step in plan.steps
            ):
                self.update(run["id"], "succeeded")
                continue
            for step in plan.steps:
                previous = latest.get(step.id)
                if previous:
                    if previous["status"] not in TERMINAL or previous["status"] == "succeeded":
                        continue
                    if previous["status"] != "failed" or previous["attempt"] >= step.retries:
                        self.update(
                            run["id"], "failed", f"Step {step.id} ended as {previous['status']}."
                        )
                        break
                    previous_job = self.records.store.get(previous["job_id"])
                    if previous_job and previous_job.finished_at:
                        delay = (
                            datetime.now(UTC) - datetime.fromisoformat(previous_job.finished_at)
                        ).total_seconds()
                        if delay < step.retry_backoff_seconds * (2 ** previous["attempt"]):
                            continue
                if any(
                    dep not in latest or latest[dep]["status"] != "succeeded"
                    for dep in step.depends_on
                ):
                    continue
                if len(run["attempts"]) >= plan.budget.max_jobs:
                    self.update(run["id"], "blocked", "Workflow job budget exhausted.")
                    break
                try:
                    request = resolve(
                        step, latest, self.records.store, self.worker.outputs, self.settings
                    )
                    await self.preflight(request)
                    self.records.enqueue(
                        run["id"],
                        step.id,
                        request,
                        self.settings.max_pending,
                        self.settings.max_jobs,
                    )
                except CapacityError:
                    # Existing queue limits apply. No retry or new task while capacity is full.
                    break
                except Exception as exc:
                    from fastapi import HTTPException

                    if isinstance(exc, HTTPException):
                        reason = str(exc.detail)
                    elif isinstance(exc, (ValueError, KeyError, OSError, ConflictError)):
                        reason = str(exc)
                    else:
                        raise
                    self.update(run["id"], "blocked", reason)
                break
