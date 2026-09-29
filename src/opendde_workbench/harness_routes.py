"""Same-origin controls for native Harness campaigns; credentials remain server-side."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from .harness_service import HarnessService
from .store import ConflictError


class DesignPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config: dict


class ImportConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: UUID


class ReviewedPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    digest: str = Field(pattern=r"^[0-9a-f]{64}$")


class Adjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    num_sequences: int | None = Field(default=None, ge=1, le=256)
    reflection_interval: int | None = Field(default=None, ge=1, le=100)


class CampaignReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["evolution", "structure", "epitope"]


def register_harness(app, store, assets, settings, mutation):
    service = HarnessService(settings, store, assets)

    async def invoke(message, timeout=45):
        try:
            return await service.invoke(message, timeout=timeout)
        except (ValueError, KeyError) as exc:
            raise HTTPException(422, str(exc)) from exc
        except (OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(503, str(exc)) from exc

    def controlled(task_id):
        with store.connect() as db:
            if not db.execute("SELECT 1 FROM design_plans WHERE task_id=?", (task_id,)).fetchone():
                raise HTTPException(404, "This campaign was not launched from this workbench.")

    @app.get("/api/harness/readiness")
    def readiness():
        return {
            "configured": bool(settings.harness_python and settings.harness_python.is_file()),
            "compute_configured": bool(settings.harness_url),
            "shared_storage_configured": bool(settings.harness_shared_dir),
            "required_settings": [
                name
                for name, ready in [
                    ("WB_HARNESS_PYTHON", bool(settings.harness_python)),
                    ("WB_HARNESS_URL", bool(settings.harness_url)),
                    ("WB_HARNESS_SHARED_DIR", bool(settings.harness_shared_dir)),
                ]
                if not ready
            ],
        }

    @app.get("/api/harness/schemas")
    async def schemas():
        return await invoke({"operation": "schemas"})

    @app.get("/api/harness/context")
    async def context():
        return await invoke({"operation": "context"})

    @app.post("/api/harness/config/import", dependencies=[Depends(mutation)])
    async def import_config(value: ImportConfig):
        try:
            asset = assets.get(value.asset_id)
            if asset.kind != "config" or asset.size > 262144:
                raise ValueError("Choose a design JSON/YAML no larger than256KiB.")
            return await invoke({"operation": "import_config", "path": str(assets.path(asset))})
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/harness/plans", dependencies=[Depends(mutation)])
    async def validate(value: DesignPlan, idempotency_key: Annotated[UUID, Header()]):
        try:
            return await service.validate(value.config, idempotency_key)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        except (OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.get("/api/harness/plans")
    def plans():
        with store.connect() as db:
            return [
                service.public(dict(row))
                for row in db.execute(
                    "SELECT * FROM design_plans ORDER BY created_at DESC LIMIT 100"
                )
            ]

    async def dispatch(plan_id, value, reconcile=False):
        try:
            return await service.start(plan_id, value.digest, reconcile)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/api/harness/plans/{plan_id}/start", dependencies=[Depends(mutation)])
    async def start(plan_id: UUID, value: ReviewedPlan):
        return await dispatch(plan_id, value)

    @app.post("/api/harness/plans/{plan_id}/reconcile", dependencies=[Depends(mutation)])
    async def reconcile(plan_id: UUID, value: ReviewedPlan):
        return await dispatch(plan_id, value, True)

    @app.get("/api/harness/campaigns/{task_id}")
    async def status(task_id: str):
        controlled(task_id)
        return await invoke({"operation": "status", "task_id": task_id})

    @app.get("/api/harness/campaigns/{task_id}/candidates")
    @app.get("/api/harness/campaigns/{task_id}/candidates.json")
    async def candidates(task_id: str, top_k: int = Query(20, ge=1, le=100)):
        controlled(task_id)
        return await invoke({"operation": "candidates", "task_id": task_id, "top_k": top_k})

    @app.get("/api/harness/campaigns/{task_id}/structure")
    async def structure(task_id: str, candidate_id: str = Query(min_length=1, max_length=200)):
        controlled(task_id)
        data = await invoke(
            {"operation": "candidate_structure", "task_id": task_id, "candidate_id": candidate_id}
        )
        format = "pdb" if data["format"] == "pdb" else "cif"
        return Response(
            data["text"],
            media_type="text/plain",
            headers={
                "X-Structure-Format": format,
                "Content-Disposition": f'attachment; filename="candidate.{format}"',
            },
        )

    @app.post("/api/harness/campaigns/{task_id}/stop", dependencies=[Depends(mutation)])
    async def stop(task_id: str):
        controlled(task_id)
        return await invoke({"operation": "stop", "task_id": task_id})

    @app.post("/api/harness/campaigns/{task_id}/analysis", dependencies=[Depends(mutation)])
    async def report(task_id: str, value: CampaignReport):
        controlled(task_id)
        return await invoke(
            {"operation": "campaign_analysis", "task_id": task_id, "kind": value.kind}, timeout=180
        )

    @app.post("/api/harness/campaigns/{task_id}/adjust", dependencies=[Depends(mutation)])
    async def adjust(task_id: str, value: Adjustment):
        controlled(task_id)
        return await invoke(
            {
                "operation": "adjust",
                "task_id": task_id,
                "adjustments": value.model_dump(exclude_none=True),
            }
        )

    return service
