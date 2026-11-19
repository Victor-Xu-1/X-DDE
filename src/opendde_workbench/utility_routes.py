"""State and explicit power control for the existing local recognition workbench."""

import asyncio
import json
import re
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

from fastapi import Depends, FastAPI, HTTPException

RECOGNITION_ORIGINS = "http://127.0.0.1:8940 http://localhost:8940"
_RECOGNITION_URL = "http://127.0.0.1:8940/"
_RECOGNITION_PHASES = frozenset({
    "stopped", "starting", "loading", "ready", "busy", "stopping", "error",
})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _recognition_opener(*handlers):
    # Fixed loopback destination, no proxy, redirects, user URLs or model start.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), *handlers)


def _read_document(opener, request):
    with opener.open(request, timeout=2) as response:
        body = response.read(4097)
    value = json.loads(body) if len(body) <= 4096 else None
    return value if isinstance(value, dict) else {}


def _recognition_document(path):
    try:
        return _read_document(_recognition_opener(), _RECOGNITION_URL + path)
    except (OSError, ValueError, urllib.error.URLError):
        return {}


def _recognition_health():
    state = _recognition_document("health")
    return state if state.get("app") == "decimer-workbench" else {}


def recognition_available():
    return bool(_recognition_health())


def _public_power(state):
    phase, enabled = state.get("phase"), state.get("enabled")
    if isinstance(phase, str) and phase in _RECOGNITION_PHASES and isinstance(enabled, bool):
        return {"phase": phase, "enabled": enabled}
    return None


def _recognition_status(include_power):
    health = _recognition_health()
    available = bool(health)
    result = {"available": available, "port": 8940}
    if include_power and available:
        if power := _public_power(_recognition_document("api/state")):
            result["power"] = power
        if health.get("idlePower") is True:
            result["idle_power"] = True
    return result


def _change_recognition_power(enabled):
    # Use a fresh companion session for this request. No browser cookies, URLs
    # or companion credentials travel between the two applications.
    health = _recognition_health()
    if not health:
        raise HTTPException(503, "The local recognition workbench is offline.")
    if health.get("idlePower") is not True:
        raise HTTPException(409, "Use the switch in the recognition workbench.")
    opener = _recognition_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    try:
        session = _read_document(opener, _RECOGNITION_URL + "api/session")
        token, previous = session.get("csrf"), _public_power(session)
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token) or not previous:
            raise ValueError("Invalid recognition session")
        if previous["phase"] in {"busy", "stopping"}:
            raise HTTPException(409, "Wait for recognition to finish before switching the service.")
        request = urllib.request.Request(
            _RECOGNITION_URL + "api/power/idle",
            data=json.dumps({"enabled": enabled}).encode(),
            headers={"Content-Type": "application/json", "X-CSRF-Token": token},
            method="POST",
        )
        power = _public_power(_read_document(opener, request))
        if power is None or power["enabled"] != enabled:
            raise ValueError("Invalid recognition power reply")
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            raise HTTPException(409, "Wait for current recognition to finish.") from exc
        raise HTTPException(502, "Could not confirm the recognition power change.") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(502, "Could not confirm the recognition power change.") from exc
    return {"available": True, "port": 8940, "idle_power": True, "power": power}


def register_utilities(app: FastAPI):
    @app.get("/api/utilities/recognition")
    async def recognition(include_power: bool = False):
        return await asyncio.to_thread(_recognition_status, include_power)


def register_recognition_power(app: FastAPI, mutation):
    power_lock = asyncio.Lock()

    @app.post("/api/utilities/recognition/{action}", dependencies=[Depends(mutation)])
    async def recognition_power(action: str):
        if action not in {"start", "stop"}:
            raise HTTPException(404, "Unknown recognition power action.")
        async with power_lock:
            return await asyncio.to_thread(_change_recognition_power, action == "start")
