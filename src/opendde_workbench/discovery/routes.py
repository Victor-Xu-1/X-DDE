"""Explicit identifier lookup with existing session/CSRF boundary and bounded concurrency."""

from threading import BoundedSemaphore

from fastapi import Depends, HTTPException

from .contract import EvidenceLookup
from .sources import lookup
from .transport import SourceUnavailable


def register_discovery(app, mutation):
    gate = BoundedSemaphore(2)

    @app.post("/api/discovery/lookup", dependencies=[Depends(mutation)])
    def search(value: EvidenceLookup):
        if not gate.acquire(blocking=False):
            raise HTTPException(429, "Two evidence searches are active; retry shortly.")
        try:
            return lookup(value.entity, value.query.strip())
        except SourceUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        finally:
            gate.release()
