"""Discover reusable models through the existing successful-job authority."""

from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..scientific_objects import MoleculeRef
from .property_models import (
    PropertyModelCatalogue,
    PropertyModelSummary,
    PropertyModelUnavailable,
    verified_property_model,
)


class MsaInspection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference: MoleculeRef
    sequence: str = Field(min_length=1, max_length=5000, pattern=r"^[ACDEFGHIKLMNPQRSTVWYX]+$")


def register_scientific_routes(app, store, settings, assets, mutation):
    @app.get("/api/scientific/binder-checkpoints/{identifier}")
    def binder_checkpoint(identifier: UUID):
        from .binder_checkpoints import describe

        try:
            return describe(settings.state_dir, store, identifier)
        except (OSError, ValueError, KeyError) as exc:
            raise HTTPException(
                409, "The original binder stage checkpoint is unavailable or changed."
            ) from exc

    @app.post("/api/scientific/boltz/msa-check", dependencies=[Depends(mutation)])
    def inspect_msa(value: MsaInspection):
        from .boltz_inputs import checked_msa

        if value.reference.record or value.reference.conformer:
            raise HTTPException(422, "Choose the complete original alignment file.")
        try:
            return checked_msa(value.reference, value.sequence, assets)
        except FileNotFoundError as exc:
            raise HTTPException(404, "The selected alignment is unavailable.") from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(409, "The selected alignment could not be read.") from exc

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
