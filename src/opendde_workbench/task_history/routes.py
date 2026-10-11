"""A paginated presentation of task history; no submission or lifecycle changes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import BaseModel, Field

from ..models import Job, Status
from .kinds import task_kind_rules
from .query import history_page


class TaskHistoryItem(BaseModel):
    job: Job
    capability_id: str


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
