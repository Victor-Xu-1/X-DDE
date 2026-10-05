"""Same-origin preview mutations use the existing CSRF, idempotency and queue boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException

from ..models import Job
from ..store import ConflictError
from .pose_contract import PreviewMinimizeInput
from .pose_minimization import PoseMinimization


def register_pose_minimization(app, store, assets, settings, mutation, enqueue):
    service = PoseMinimization(store, assets, settings)

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
