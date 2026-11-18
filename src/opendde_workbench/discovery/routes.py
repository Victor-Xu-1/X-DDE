"""Explicit identifier lookup with existing session/CSRF boundary and bounded concurrency."""

from contextlib import nullcontext
from threading import BoundedSemaphore

from fastapi import Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from .contract import EvidenceLookup
from .sources import lookup
from .transport import SourceUnavailable


def register_discovery(app, mutation):
    gate = BoundedSemaphore(2)

    @app.post("/api/discovery/lookup", dependencies=[Depends(mutation)])
    async def search(value: EvidenceLookup):
        controls = app.state.runtime_controls
        with controls.interactive("discovery") if controls is not None else nullcontext():
            if not gate.acquire(blocking=False):
                raise HTTPException(429, "Two evidence searches are active; retry shortly.")
            try:
                return await run_in_threadpool(lookup, value.entity, value.query.strip())
            except SourceUnavailable as exc:
                raise HTTPException(503, str(exc)) from exc
            finally:
                gate.release()
