"""Capability inventory and typed public request contracts owned by X-DDE."""

import json
from functools import lru_cache

from fastapi import HTTPException

from ..requests import TASK_ADAPTER
from .definitions import CAPABILITIES
from .modalities import modality_catalogue
from .runtime import availability


@lru_cache(maxsize=1)
def _request_schema_json() -> str:
    return json.dumps(TASK_ADAPTER.json_schema(), sort_keys=True)


def request_schema() -> dict:
    return json.loads(_request_schema_json())


def frontend_catalogue() -> list[dict]:
    return [
        {
            key: spec.model_dump(mode="json")[key]
            for key in ("id", "group", "label", "note", "source", "modalities", "modality_role")
        }
        for spec in CAPABILITIES.values()
        if spec.frontend_form is not None
    ]


def register_capabilities(app, settings, health):
    @app.get("/api/capabilities/request-schema")
    def public_request_schema():
        return {
            "schema_version": 1,
            "task_request": request_schema(),
            "native_harness_schema_endpoint": "/api/harness/schemas",
            "research_plan_schema_endpoint": "/api/workflows/schema",
        }

    @app.get("/api/capabilities")
    async def catalogue():
        snapshot = await health()
        return {
            "schema_version": 1,
            "owner": "X-DDE",
            "modalities": modality_catalogue(),
            "capabilities": [
                {
                    **spec.model_dump(mode="json"),
                    "availability": availability(spec, settings, snapshot["engine"]).model_dump(
                        mode="json"
                    ),
                }
                for spec in CAPABILITIES.values()
            ],
        }

    @app.get("/api/capabilities/{capability_id}")
    async def detail(capability_id: str):
        spec = CAPABILITIES.get(capability_id)
        if spec is None:
            raise HTTPException(404, "Capability is not registered in this X-DDE version.")
        snapshot = await health()
        return {
            **spec.model_dump(mode="json"),
            "availability": availability(spec, settings, snapshot["engine"]).model_dump(
                mode="json"
            ),
        }
