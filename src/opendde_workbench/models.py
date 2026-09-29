"""Public API contracts and the validated OpenDDE input builder."""

from enum import StrEnum

from pydantic import BaseModel

from .entities import Component as Component
from .parameters import Parameters as Parameters
from .prediction import Prediction as Prediction
from .requests import TaskRequest


class Status(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLING = "cancelling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


TERMINAL = {Status.SUCCEEDED, Status.FAILED, Status.CANCELLED, Status.INTERRUPTED}


class Artifact(BaseModel):
    name: str
    size: int


class Job(BaseModel):
    id: str
    request: TaskRequest
    status: Status
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    parent_id: str | None = None
