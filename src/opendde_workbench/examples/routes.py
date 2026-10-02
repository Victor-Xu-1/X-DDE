"""Preparing an example imports inputs; it never silently submits scientific jobs."""

from fastapi import Depends, HTTPException

from ..research.storage import ScientificStore
from ..store import ConflictError
from .catalogue import CASES, FILES, MODULES
from .contracts import PinRequest, PreparedExample
from .pins import ExamplePins
from .preparation import prepare_example


def register_examples(app, store, assets, settings, mutation):
    scientific = ScientificStore(store, assets)
    pins = ExamplePins(store, settings.state_dir)
    cache = settings.state_dir / "public-example-cache"

    def detail(capability_id, *, verify=False):
        if capability_id not in MODULES:
            raise HTTPException(404, "No reviewed example for this capability.")
        module = MODULES[capability_id]
        case = CASES[module.case_id]
        try:
            record = pins.get(capability_id, verify=verify)
        except (ValueError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc
        return {
            "module": module,
            "case": case,
            "files": [FILES[key] for key in case.files],
            "pin": record,
            "computed_result_available": record is not None,
        }

    @app.get("/api/examples")
    def examples():
        return {"schema_version": 1, "examples": [detail(key) for key in MODULES]}

    @app.get("/api/examples/{capability_id}")
    def example(capability_id: str):
        return detail(capability_id, verify=True)

    @app.post(
        "/api/examples/{capability_id}/prepare",
        response_model=PreparedExample,
        dependencies=[Depends(mutation)],
    )
    def prepare(capability_id: str):
        detail(capability_id)
        try:
            return prepare_example(capability_id, scientific, cache)
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/examples/{capability_id}/pin", dependencies=[Depends(mutation)])
    def pin(capability_id: str, value: PinRequest):
        detail(capability_id)
        try:
            prepared = prepare_example(capability_id, scientific, cache)
            return pins.pin(capability_id, value.job_id, prepared)
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return pins
