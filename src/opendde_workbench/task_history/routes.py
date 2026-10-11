"""A paginated presentation of task history; no submission or lifecycle changes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import BaseModel, Field

from ..models import Job, Status
from .identity import task_identity
from .kinds import task_kind_rules
from .query import history_page


class SourceCase(BaseModel):
    id: str
    label: tuple[str, str]


class TaskHistoryItem(BaseModel):
    job: Job
    capability_id: str
    example_cases: list[SourceCase] = Field(default_factory=list)
    origin: Literal["research", "fixed_example", "setup_validation"] = "research"


class TaskHistoryIdentity(BaseModel):
    job_id: UUID
    capability_id: str
    origin: Literal["research", "fixed_example", "setup_validation"]
    example_cases: list[SourceCase]


class TaskKindCount(BaseModel):
    total: int = Field(ge=0)
    active: int = Field(ge=0)


class TaskHistoryPage(BaseModel):
    items: list[TaskHistoryItem]
    counts: dict[str, TaskKindCount]
    total: int
    offset: int
    limit: int


def register_task_history(app, library):
    @app.get("/api/task-history/{job_id}/identity", response_model=TaskHistoryIdentity)
    def identity(job_id: UUID):
        try:
            value = task_identity(library, job_id)
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(
                409,
                "The retained case records could not be verified. "
                "Restore the original case records.",
            ) from exc
        if value is None:
            raise HTTPException(404, "Task not found.")
        return value

    @app.get("/api/task-history", response_model=TaskHistoryPage)
    def listing(
        capability: Annotated[list[str] | None, Query(max_length=100)] = None,
        project_id: UUID | None = None,
        status: Status | None = None,
        q: str = Query("", max_length=180),
        offset: int = Query(0, ge=0, le=1000000),
        limit: int = Query(20, ge=1, le=100),
        scope: Literal["research", "examples"] = "research",
    ):
        identifiers = tuple(dict.fromkeys(capability or ()))
        registered = {rule["id"] for rule in task_kind_rules()} | {"other"}
        if any(value not in registered for value in identifiers):
            raise HTTPException(422, "Unknown task type. Refresh the workbench and try again.")
        try:
            return history_page(
                library,
                capabilities=identifiers,
                project_id=project_id,
                status=status,
                query=q,
                offset=offset,
                limit=limit,
                scope=scope,
            )
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(
                409,
                "The retained case records could not be verified. "
                "Restore the original case records.",
            ) from exc
