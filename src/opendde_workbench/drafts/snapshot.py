"""Shared bounds for lossless editor snapshots, independent of task admission."""

import json
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

Number = Annotated[float, Field(allow_inf_nan=False, ge=-1e12, le=1e12)]


class SnapshotModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def bounded_state(state, settings=None):
    def visit(value, depth=0):
        if depth > 8:
            raise ValueError("Draft settings exceed the supported nesting depth.")
        if isinstance(value, dict):
            if len(value) > 64:
                raise ValueError("Too many draft settings.")
            for key, item in value.items():
                if len(key) > 80:
                    raise ValueError("Draft setting name is too long.")
                visit(item, depth + 1)
        elif isinstance(value, list):
            if len(value) > 5000:
                raise ValueError("Too many draft values.")
            for item in value:
                visit(item, depth + 1)
        elif isinstance(value, str) and len(value) > 50000:
            raise ValueError("Draft value is too long.")

    if settings is None:
        settings = state.settings
    visit(settings.model_dump() if isinstance(settings, BaseModel) else settings)
    try:
        body = json.dumps(state.model_dump(mode="json"), allow_nan=False)
    except ValueError as exc:
        raise ValueError("Draft values must be finite JSON.") from exc
    if len(body.encode()) > 200000:
        raise ValueError("Draft exceeds the 200 kB snapshot limit.")
    return state
