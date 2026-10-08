"""Same-origin preview mutations use the existing CSRF, idempotency and queue boundary."""

from typing import Annotated
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import Depends, Header, HTTPException

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
            # Reopening the same record shares its native task rather than
            # computing a new pose for every panel or browser refresh.
            key = uuid5(NAMESPACE_URL, "x-dde-initial-pose-v1:" + task.model_dump_json())
            if value.retry:
                with store.connect() as db:
                    cached = db.execute(
                        "SELECT status FROM jobs WHERE idempotency_key=?", (str(key),)
                    ).fetchone()
                if cached and cached["status"] in {"failed", "cancelled", "interrupted"}:
                    key = idempotency_key
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
