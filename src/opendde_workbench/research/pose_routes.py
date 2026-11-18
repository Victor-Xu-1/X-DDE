"""Same-origin preview mutations use the existing CSRF, idempotency and queue boundary."""

from typing import Annotated
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import Depends, Header, HTTPException

from ..engine_registry import engine_for
from ..models import Job
from ..store import ConflictError
from .initial_pose import InitialPosePreparation
from .pose_contract import InitialPoseInput, PreviewMinimizeInput
from .pose_minimization import PoseMinimization


def register_pose_minimization(app, store, assets, settings, mutation, enqueue):
    service = PoseMinimization(store, assets, settings)
    initial = InitialPosePreparation(store, assets, settings)

    @app.post("/api/research/poses/initial", dependencies=[Depends(mutation)])
    async def initial_pose(value: InitialPoseInput, idempotency_key: Annotated[UUID, Header()]):
        try:
            task, pose = initial.resolve(value)
            if pose is not None:
                return {"state": "ready", "pose": pose.model_dump(mode="json")}
            previous = initial.previous_attempt(task, exact_method=value.retry)
            if previous is not None and previous.status == "succeeded":
                return {"state": "task", "job": previous.model_dump(mode="json")}
            controls = getattr(app.state, "runtime_controls", None)
            if controls is not None and engine_for(task.operation).id not in controls.enabled:
                return {"state": "backend_off"}
            if not value.allow_compute:
                raise HTTPException(
                    503,
                    "Task service is unavailable; previously calculated poses remain available.",
                )
            if previous:
                retryable = previous.status in {"failed", "cancelled", "interrupted"}
                if not value.retry or not retryable:
                    return {"state": "task", "job": previous.model_dump(mode="json")}
                key = idempotency_key
            else:
                # Concurrent first views share one task for this exact source and settings.
                key = uuid5(NAMESPACE_URL, "x-dde-initial-pose-v1:" + task.model_dump_json())
            job = await enqueue(task, key)
            return {"state": "task", "job": job.model_dump(mode="json")}
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, KeyError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post(
        "/api/research/poses/minimize",
        response_model=Job,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    async def minimize(value: PreviewMinimizeInput, idempotency_key: Annotated[UUID, Header()]):
        try:
            task = service.task(value)
            return await enqueue(task, idempotency_key)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, KeyError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/research/poses/{job_id}/save", dependencies=[Depends(mutation)])
    def saved_pose(job_id: UUID):
        try:
            return service.save(job_id)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, KeyError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc
