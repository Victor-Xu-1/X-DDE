"""X-DDE durable research plans on the platform's existing execution chain."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..store import ConflictError
from .contracts import PlanInput, RunInput
from .service import WorkflowService
from .storage import WorkflowRecords


def register_workflows(app, store, assets, worker, preflight, settings, mutation):
    records = WorkflowRecords(store)
    service = WorkflowService(records, worker, preflight, settings)
    worker.before_claim = service.tick
    worker.on_progress = service.check_running_budgets

    def translated(fn):
        try:
            return fn()
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/workflows/schema")
    def schema():
        return {"schema_version": 1, "plan": PlanInput.model_json_schema()}

    @app.get("/api/workflows/plans")
    def plans(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=10000)):
        return translated(lambda: records.plans(limit, offset))

    @app.post("/api/workflows/plans", status_code=201, dependencies=[Depends(mutation)])
    def save(value: PlanInput, idempotency_key: Annotated[UUID, Header()]):
        # Planning checks file/version bindings without starting scientific programs.
        def create():
            for step in value.steps:
                if step.data_bindings:
                    from ..datasets.bindings import asset_bindings

                    asset_bindings(
                        step.request,
                        assets,
                        deferred_sources={binding.slot for binding in step.data_bindings},
                    )
                else:
                    assets.validate_bindings(step.request)
            return records.save_plan(value, idempotency_key)

        return translated(create)

    @app.get("/api/workflows/plans/{plan_id}")
    def plan(plan_id: UUID):
        return translated(lambda: records.plan(plan_id))

    @app.post(
        "/api/workflows/plans/{plan_id}/runs", status_code=201, dependencies=[Depends(mutation)]
    )
    def start(plan_id: UUID, value: RunInput, idempotency_key: Annotated[UUID, Header()]):
        return translated(lambda: records.start(plan_id, value.plan_sha256, idempotency_key))

    @app.get("/api/workflows/runs")
    def runs(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0),
        plan_id: UUID | None = None,
    ):
        return translated(lambda: records.runs(limit=limit, offset=offset, plan_id=plan_id))

    @app.get("/api/workflows/runs/{run_id}")
    def run(run_id: UUID):
        return translated(lambda: records.run(run_id))

    @app.post("/api/workflows/runs/{run_id}/pause", dependencies=[Depends(mutation)])
    def pause(run_id: UUID):
        return translated(lambda: records.change(run_id, "paused", expected={"running", "blocked"}))

    @app.post("/api/workflows/runs/{run_id}/resume", dependencies=[Depends(mutation)])
    def resume(run_id: UUID):
        return translated(lambda: records.change(run_id, "running", expected={"paused", "blocked"}))

    @app.post("/api/workflows/runs/{run_id}/cancel", dependencies=[Depends(mutation)])
    def cancel(run_id: UUID):
        return translated(lambda: service.cancel(run_id))

    return service
