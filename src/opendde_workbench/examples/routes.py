"""One example authority per cohort; preparing inputs never submits scientific work."""

from typing import Literal

from fastapi import Depends, HTTPException

from ..research.storage import ScientificStore
from ..store import ConflictError
from .bundle_catalogue import bundle_catalogue
from .contracts import PinRequest, PreparedExample, RecordPinRequest
from .pins import ExamplePins
from .records import ExampleRecords
from .supporting import supporting_stage_names

ExampleProfile = Literal["current", "stat6", "del6", "archive"]


def register_examples(app, store, assets, settings, mutation):
    scientific = ScientificStore(store, assets)
    catalogues = {
        profile: bundle_catalogue(profile) for profile in ("current", "stat6", "del6", "archive")
    }
    pins = {
        profile: ExamplePins(store, settings.state_dir, modules=catalogue.modules)
        for profile, catalogue in catalogues.items()
    }
    records = {
        profile: ExampleRecords(store, assets, settings, modules=catalogue.modules)
        for profile, catalogue in catalogues.items()
    }
    cache = settings.state_dir / "public-example-cache"

    def detail(capability_id, *, verify=False, profile="current"):
        catalogue = catalogues[profile]
        if capability_id not in catalogue.modules:
            raise HTTPException(404, "No reviewed template for this cohort and capability.")
        try:
            record = pins[profile].get(capability_id, verify=verify)
            compound = records[profile].get(capability_id, verify=verify)
        except (ValueError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc
        value = {
            "module": catalogue.modules[capability_id],
            "case": catalogue.case_for(capability_id),
            "files": catalogue.visible_files(capability_id),
            "pin": record,
            "record_pin": compound,
            "supporting_stage_names": supporting_stage_names(store, record or compound, scientific),
            "computed_result_available": record is not None
            or bool(compound and compound.computed_result_available),
        }
        if (study := catalogue.study(capability_id)) is not None:
            value["study"] = study
        return value

    def prepared(capability_id, profile):
        return catalogues[profile].prepare(capability_id, scientific, cache, records[profile])

    @app.get("/api/examples")
    def examples(profile: ExampleProfile = "current"):
        return {
            "schema_version": 1,
            "examples": [detail(key, profile=profile) for key in catalogues[profile].modules],
        }

    @app.get("/api/examples/{capability_id}")
    def example(capability_id: str, profile: ExampleProfile = "current"):
        return detail(capability_id, verify=True, profile=profile)

    @app.get("/api/examples/{capability_id}/result", response_model=PreparedExample)
    def result(capability_id: str, profile: ExampleProfile = "current"):
        metadata = detail(capability_id, profile=profile)
        try:
            record = records[profile].prepared(capability_id)
        except (ValueError, OSError, KeyError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc
        if not record or not record["pin"]["computed_result_available"]:
            raise HTTPException(404, "This module has no saved reviewed record result.")
        return PreparedExample(
            module=metadata["module"],
            case=metadata["case"],
            objects={},
            sequences={},
            sources=metadata["case"].sources,
            record=record,
            study=metadata.get("study"),
        )

    @app.post(
        "/api/examples/{capability_id}/prepare",
        response_model=PreparedExample,
        dependencies=[Depends(mutation)],
    )
    def prepare(capability_id: str, profile: ExampleProfile = "current"):
        detail(capability_id, profile=profile)
        try:
            return prepared(capability_id, profile)
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/examples/{capability_id}/pin", dependencies=[Depends(mutation)])
    def pin(capability_id: str, value: PinRequest, profile: ExampleProfile = "current"):
        detail(capability_id, profile=profile)
        try:
            return pins[profile].pin(
                capability_id,
                value.job_id,
                prepared(capability_id, profile),
                review=value.review,
                supporting_job_ids=value.supporting_job_ids,
            )
        except (ValueError, OSError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/examples/{capability_id}/record-pin", dependencies=[Depends(mutation)])
    def record_pin(
        capability_id: str, value: RecordPinRequest, profile: ExampleProfile = "current"
    ):
        detail(capability_id, profile=profile)
        try:
            return records[profile].pin(
                capability_id,
                value.record_id,
                value.run_id,
                prepared(capability_id, profile),
                review=value.review,
                supporting_job_ids=value.supporting_job_ids,
            )
        except (ValueError, OSError, KeyError, ConflictError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return pins["archive"]
