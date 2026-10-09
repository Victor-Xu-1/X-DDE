"""Preparing an example imports inputs; it never silently submits scientific jobs."""

from typing import Literal

from fastapi import Depends, HTTPException

from ..research.storage import ScientificStore
from ..store import ConflictError
from .catalogue import CASES, FILES, MODULES
from .contracts import PinRequest, PreparedExample, RecordPinRequest
from .pins import ExamplePins
from .preparation import prepare_example
from .records import ExampleRecords
from .stat6 import catalogue as stat6
from .stat6.preparation import prepare_stat6


def register_examples(app, store, assets, settings, mutation):
    scientific = ScientificStore(store, assets)
    pins = ExamplePins(store, settings.state_dir)
    records = ExampleRecords(store, assets, settings)
    study_pins = ExamplePins(store, settings.state_dir, modules=stat6.MODULES)
    study_records = ExampleRecords(store, assets, settings, modules=stat6.MODULES)
    cache = settings.state_dir / "public-example-cache"

    def detail(capability_id, *, verify=False, profile="stat6"):
        if profile == "stat6":
            if capability_id not in stat6.MODULES:
                raise HTTPException(404, "No reviewed STAT6 template for this capability.")
            try:
                record = study_pins.get(capability_id, verify=verify)
                compound = study_records.get(capability_id, verify=verify)
            except (ValueError, OSError) as exc:
                raise HTTPException(409, str(exc)) from exc
            return {
                "module": stat6.MODULES[capability_id],
                "case": stat6.CASE,
                "files": list(stat6.FILES.values()),
                "pin": record,
                "record_pin": compound,
                "study": stat6.study_context(capability_id),
                "computed_result_available": record is not None
                or bool(compound and compound.computed_result_available),
            }
        if capability_id not in MODULES:
            raise HTTPException(404, "No reviewed example for this capability.")
        module = MODULES[capability_id]
        case = CASES[module.case_id]
        try:
            record = pins.get(capability_id, verify=verify)
            compound = records.get(capability_id, verify=verify)
        except (ValueError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc
        return {
            "module": module,
            "case": case,
            "files": [FILES[key] for key in case.files],
            "pin": record,
            "record_pin": compound,
            "computed_result_available": record is not None
            or bool(compound and compound.computed_result_available),
        }

    @app.get("/api/examples")
    def examples(profile: Literal["stat6", "archive"] = "stat6"):
        return {"schema_version": 1, "examples": [detail(key, profile=profile) for key in MODULES]}

    @app.get("/api/examples/{capability_id}")
    def example(capability_id: str, profile: Literal["stat6", "archive"] = "stat6"):
        return detail(capability_id, verify=True, profile=profile)

    @app.post(
        "/api/examples/{capability_id}/prepare",
        response_model=PreparedExample,
        dependencies=[Depends(mutation)],
    )
    def prepare(capability_id: str, profile: Literal["stat6", "archive"] = "stat6"):
        detail(capability_id, profile=profile)
        try:
            if profile == "stat6":
                return prepare_stat6(capability_id, scientific, records=study_records)
            return prepare_example(capability_id, scientific, cache, records=records)
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/examples/{capability_id}/pin", dependencies=[Depends(mutation)])
    def pin(capability_id: str, value: PinRequest, profile: Literal["stat6", "archive"] = "stat6"):
        detail(capability_id, profile=profile)
        try:
            if profile == "stat6":
                prepared = prepare_stat6(capability_id, scientific, records=study_records)
                return study_pins.pin(capability_id, value.job_id, prepared)
            prepared = prepare_example(capability_id, scientific, cache, records=records)
            return pins.pin(capability_id, value.job_id, prepared)
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/examples/{capability_id}/record-pin", dependencies=[Depends(mutation)])
    def record_pin(
        capability_id: str, value: RecordPinRequest, profile: Literal["stat6", "archive"] = "stat6"
    ):
        detail(capability_id, profile=profile)
        try:
            if profile == "stat6":
                prepared = prepare_stat6(capability_id, scientific, records=study_records)
                return study_records.pin(capability_id, value.record_id, value.run_id, prepared)
            prepared = prepare_example(capability_id, scientific, cache, records=records)
            return records.pin(capability_id, value.record_id, value.run_id, prepared)
        except (ValueError, OSError, KeyError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return pins
