"""Discover reusable models through the existing successful-job authority."""

from uuid import UUID

from fastapi import HTTPException

from .property_models import (
    PropertyModelCatalogue,
    PropertyModelSummary,
    PropertyModelUnavailable,
    verified_property_model,
)


def register_scientific_routes(app, store, settings):
    @app.get("/api/scientific/property-models", response_model=PropertyModelCatalogue)
    def models():
        selected = []
        # Bound enumeration; use the existing store rather than a competing model registry.
        with store.connect() as db:
            ids = [
                row["id"]
                for row in db.execute(
                    "SELECT id FROM jobs WHERE status='succeeded' "
                    "AND json_extract(request, '$.operation')='chemprop_train' "
                    "ORDER BY created_at DESC LIMIT 100"
                )
            ]
        for identifier in ids:
            try:
                model = verified_property_model(settings.state_dir, store.get(identifier))
                selected.append(model.summary.model_dump(mode="json"))
            except (OSError, ValueError, KeyError):
                continue
        return {"models": selected}

    @app.get("/api/scientific/property-models/{identifier}", response_model=PropertyModelSummary)
    def model(identifier: UUID):
        try:
            value = verified_property_model(settings.state_dir, store.get(str(identifier)))
            return value.summary
        except PropertyModelUnavailable as exc:
            raise HTTPException(404, "The selected research model is unavailable.") from exc
        except (OSError, ValueError, KeyError) as exc:
            raise HTTPException(
                409, "The selected model's checkpoint or training evidence could not be verified."
            ) from exc
