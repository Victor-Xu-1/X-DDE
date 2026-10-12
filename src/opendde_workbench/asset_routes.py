"""Bounded scientific uploads share the normal same-origin mutation policy."""

import asyncio
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse

from .assets import AssetKind, AssetStore
from .disk_space import StorageCapacityError, StorageUnavailable, require_space


def register_assets(app: FastAPI, assets: AssetStore, mutation, minimum_free_bytes=0):
    uploads = asyncio.Semaphore(2)

    @app.get("/api/assets")
    def listing(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=10000)):
        return assets.list(limit, offset)

    @app.post("/api/assets", status_code=201, dependencies=[Depends(mutation)])
    async def upload(
        request: Request, kind: AssetKind, name: str = Query(min_length=1, max_length=240)
    ):
        try:
            async with asyncio.timeout(90), uploads:
                await asyncio.to_thread(require_space, assets.root, minimum_free_bytes)
                body = bytearray()
                async for chunk in request.stream():
                    if len(body) + len(chunk) > 25 * 1024**2:
                        raise HTTPException(413, "File exceeds25MiB.")
                    body.extend(chunk)
                await asyncio.to_thread(
                    require_space, assets.root, minimum_free_bytes + len(body)
                )
                return assets.save(name, kind, bytes(body))
        except StorageUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except StorageCapacityError as exc:
            raise HTTPException(507, str(exc)) from exc
        except TimeoutError as exc:
            raise HTTPException(408, "Upload timed out. Select the file again.") from exc
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/assets/{asset_id}/metadata")
    def metadata(asset_id: UUID):
        try:
            return assets.get(asset_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/assets/{asset_id}")
    def download(asset_id: UUID):
        try:
            asset = assets.get(asset_id)
            return FileResponse(
                assets.path(asset),
                filename=asset.name,
                media_type="application/octet-stream",
                headers={"X-Structure-Format": asset.suffix.removeprefix(".")},
            )
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.delete("/api/assets/{asset_id}", dependencies=[Depends(mutation)])
    def remove(asset_id: UUID):
        try:
            assets.delete_unused(asset_id)
            return {"deleted": True}
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
