"""Loopback deployment control and managed editor distribution serving."""

import asyncio
from pathlib import Path
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained


class Configuration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(min_length=1, max_length=1024)
    automatic: bool = False


def register_deployments(app, manager, mutation, busy):
    @app.get("/api/deployment")
    def status():
        return manager.snapshot()

    @app.post("/api/deployment/compute/{action}", dependencies=[Depends(mutation)])
    async def compute(action: str):
        if action not in {"start", "stop"}:
            raise HTTPException(404, "Unknown native compute action.")
        if app.state.quiescing:
            raise HTTPException(409, "X-DDE is already changing service state.")
        app.state.quiescing = True
        try:
            if await busy():
                raise HTTPException(
                    409, "Finish scientific tasks before changing compute services."
                )
            return await asyncio.to_thread(manager.compute.invoke, action)
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc
        finally:
            app.state.quiescing = False

    @app.post("/api/deployment/config", dependencies=[Depends(mutation)])
    def configure(value: Configuration):
        try:
            return manager.configure(value.location, value.automatic)
        except (OSError, ValueError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/deployment/packages/{package}/{action}", dependencies=[Depends(mutation)])
    async def install_package(package: str, action: str):
        if await busy():
            raise HTTPException(
                409, "Finish or stop scientific tasks before changing compute components."
            )
        try:
            return {"operations": manager.enqueue(package, action)}
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/deployment/operations/{identifier}/{action}", dependencies=[Depends(mutation)])
    def control(identifier: UUID, action: str):
        try:
            manager.control(str(identifier), action)
            return {"ok": True}
        except (KeyError, ValueError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/deployment/operations/{identifier}/log")
    def log(identifier: UUID):
        try:
            manager.store.get(str(identifier))
            root = Path(manager.store.config()["root"])
            from ..artifacts import log_tail

            return log_tail(root / "operations" / str(identifier) / "install.log")
        except (KeyError, ValueError) as exc:
            raise HTTPException(404, "Deployment log not found") from exc

    @app.get("/tools/{package}/{name:path}")
    def editor(package: str, name: str):
        entry = manager.store.installed().get(package)
        if package not in {"ketcher", "molstar"} or not entry:
            raise HTTPException(404, "Install this editor from Installation & components first.")
        try:
            root = Path(entry["web"])
            return FileResponse(contained(root, name or "index.html"))
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(404, "Editor asset not found") from exc
