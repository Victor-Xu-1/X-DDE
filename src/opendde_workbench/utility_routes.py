"""Read-only discovery of the existing local image-recognition workbench."""

import asyncio
import json
import urllib.error
import urllib.request

from fastapi import FastAPI

RECOGNITION_ORIGINS = "http://127.0.0.1:8940 http://localhost:8940"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def recognition_available():
    # Fixed loopback destination, no proxy, redirects, user URLs or model start.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open("http://127.0.0.1:8940/health", timeout=2) as response:
            body = response.read(4097)
            return len(body) <= 4096 and json.loads(body).get("app") == "decimer-workbench"
    except (OSError, ValueError, AttributeError, urllib.error.URLError):
        return False


def register_utilities(app: FastAPI):
    @app.get("/api/utilities/recognition")
    async def recognition():
        return {"available": await asyncio.to_thread(recognition_available), "port": 8940}
