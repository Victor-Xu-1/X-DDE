"""Read-only discovery of the existing local image-recognition workbench."""

import asyncio
import json
import urllib.error
import urllib.request

from fastapi import FastAPI

RECOGNITION_ORIGINS = "http://127.0.0.1:8940 http://localhost:8940"
_RECOGNITION_PHASES = frozenset({
    "stopped", "starting", "loading", "ready", "busy", "stopping", "error",
})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _recognition_document(path):
    # Fixed loopback destination, no proxy, redirects, user URLs or model start.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(f"http://127.0.0.1:8940/{path}", timeout=2) as response:
            body = response.read(4097)
            value = json.loads(body) if len(body) <= 4096 else None
            return value if isinstance(value, dict) else {}
    except (OSError, ValueError, urllib.error.URLError):
        return {}


def recognition_available():
    return _recognition_document("health").get("app") == "decimer-workbench"


def _recognition_status(include_power):
    available = recognition_available()
    result = {"available": available, "port": 8940}
    if include_power and available:
        state = _recognition_document("api/state")
        phase, enabled = state.get("phase"), state.get("enabled")
        if isinstance(phase, str) and phase in _RECOGNITION_PHASES and isinstance(enabled, bool):
            result["power"] = {"phase": phase, "enabled": enabled}
    return result


def register_utilities(app: FastAPI):
    @app.get("/api/utilities/recognition")
    async def recognition(include_power: bool = False):
        return await asyncio.to_thread(_recognition_status, include_power)
