"""Bounded scientific uploads share the normal same-origin mutation policy."""

import asyncio
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse

from .assets import AssetKind, AssetStore
from .disk_space import StorageCapacityError, StorageUnavailable, require_space


def register_assets(app: FastAPI, assets: AssetStore, mutation, minimum_free_bytes=0):
    uploads = asyncio.Semaphore(2)
    pending = set()

    def release_upload(worker):
        # An interrupted request cannot observe a later worker exception.
        # Retrieve it here as well as releasing the worker's admission slot.
        if not worker.cancelled():
            worker.exception()
        uploads.release()

    @app.get("/api/assets")
    def listing(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=10000)):
        return assets.list(limit, offset)

    @app.post("/api/assets", status_code=201, dependencies=[Depends(mutation)])
    async def upload(
        request: Request, kind: AssetKind, name: str = Query(min_length=1, max_length=240)
    ):
        acquired = False
        worker = None
        publishing = False

        async def blocking(function, *args):
            nonlocal worker
            # Shield the executor Future itself: cancelling the request (or its
            # deadline) cannot cancel the synchronous work or release its slot.
            worker = asyncio.get_running_loop().run_in_executor(None, function, *args)
            pending.add(worker)
            worker.add_done_callback(pending.discard)
            return await asyncio.shield(worker)

        try:
            async with asyncio.timeout(90):
                await uploads.acquire()
                acquired = True
                await blocking(require_space, assets.root, minimum_free_bytes)
                body = bytearray()
                async for chunk in request.stream():
                    if len(body) + len(chunk) > 25 * 1024**2:
                        raise HTTPException(413, "File exceeds25MiB.")
                    body.extend(chunk)
                await blocking(require_space, assets.root, minimum_free_bytes + len(body))
                publishing = True
                # Own immutable bytes and the complete SQLite transaction in one
                # worker; it never accesses the request stream after this point.
                return await blocking(assets.save, name, kind, bytes(body))
        except StorageUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except StorageCapacityError as exc:
            raise HTTPException(507, str(exc)) from exc
        except TimeoutError as exc:
            detail = (
                "Upload timed out; saving may still finish. "
                "Retry the same file with the same name to reuse it if saved."
                if publishing
                else "Upload timed out. Select the file again."
            )
            raise HTTPException(408, detail) from exc
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            if acquired:
                if worker is None:
                    uploads.release()
                else:
                    # Keep the slot until completion, including after client
                    # cancellation or a 408 response. Pending owns the Future.
                    worker.add_done_callback(release_upload)

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

    async def close_uploads():
        # Uvicorn drains/cancels request tasks before application shutdown, but
        # cancelled/expired requests can still own executor work. Finish that
        # work before the lifespan exits and Uvicorn replays its stop signal.
        while pending:
            await asyncio.gather(
                *(asyncio.shield(worker) for worker in tuple(pending)),
                return_exceptions=True,
            )

    return close_uploads
