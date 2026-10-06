"""Short, checked chunks keep large research transfers responsive and resumable."""

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, Request

from .asset_uploads import UploadInput, UploadStore
from .dataset_inputs import UPLOAD_CHUNK_BYTES
from .store import ConflictError


def register_uploads(app, assets, settings, mutation):
    uploads = UploadStore(
        assets,
        settings.dataset_file_bytes,
        settings.dataset_quota_bytes,
        settings.minimum_free_bytes,
    )

    def translate(exc):
        status = (
            404
            if isinstance(exc, FileNotFoundError)
            else 409
            if isinstance(exc, ConflictError)
            else 422
        )
        return HTTPException(status, str(exc))

    @app.post("/api/assets/uploads", status_code=201, dependencies=[Depends(mutation)])
    def create(value: UploadInput, idempotency_key: Annotated[UUID, Header()]):
        try:
            return uploads.create(value, idempotency_key)
        except (ValueError, ConflictError, OSError) as exc:
            raise translate(exc) from exc

    @app.get("/api/assets/uploads/{upload_id}/status")
    def status(upload_id: UUID):
        try:
            return uploads.get(upload_id)
        except (ValueError, FileNotFoundError) as exc:
            raise translate(exc) from exc

    @app.put("/api/assets/uploads/{upload_id}", dependencies=[Depends(mutation)])
    async def chunk(
        upload_id: UUID,
        request: Request,
        x_chunk_sha256: Annotated[str, Header()],
        offset: int = Query(ge=0),
    ):
        try:
            async with asyncio.timeout(90):
                body = bytearray()
                async for part in request.stream():
                    if len(body) + len(part) > UPLOAD_CHUNK_BYTES:
                        raise HTTPException(413, "Research chunk exceeds4MiB.")
                    body.extend(part)
                return await asyncio.to_thread(
                    uploads.append, upload_id, offset, bytes(body), x_chunk_sha256
                )
        except TimeoutError as exc:
            raise HTTPException(
                408, "Research transfer paused; resume from its confirmed offset."
            ) from exc
        except (ValueError, ConflictError, OSError) as exc:
            raise translate(exc) from exc

    @app.get("/api/assets/uploads/{upload_id}/chunks")
    def confirmed_chunks(
        upload_id: UUID,
        limit: int = Query(128, ge=1, le=128),
        offset: int = Query(0, ge=0, le=262144),
    ):
        try:
            return uploads.chunks(upload_id, limit, offset)
        except (ValueError, FileNotFoundError) as exc:
            raise translate(exc) from exc

    @app.post("/api/assets/uploads/{upload_id}/complete", dependencies=[Depends(mutation)])
    async def complete(upload_id: UUID):
        try:
            return await asyncio.to_thread(uploads.finalize, upload_id)
        except (ValueError, ConflictError, OSError, EOFError) as exc:
            raise translate(exc) from exc

    @app.delete("/api/assets/uploads/{upload_id}", dependencies=[Depends(mutation)])
    def cancel(upload_id: UUID):
        try:
            return uploads.cancel(upload_id)
        except (ValueError, ConflictError, OSError) as exc:
            raise translate(exc) from exc
