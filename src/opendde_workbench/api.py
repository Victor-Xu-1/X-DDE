"""Loopback API: validated requests, same-origin mutations, safe result downloads."""

import fcntl
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from .artifacts import contained, list_artifacts, log_tail
from .engine import DockerEngine, Engine
from .models import TERMINAL, Job, Prediction
from .projects import register_projects
from .science_routes import register_science
from .settings import Settings
from .store import CapacityError, ConflictError, Store
from .worker import Worker


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    store = Store(settings.state_dir / "jobs.sqlite3")
    engine = engine or DockerEngine(settings)
    worker = Worker(store, engine, settings)
    csrf = secrets.token_urlsafe(32)
    health_cache = {"expires": 0.0, "value": None}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        with (settings.state_dir / "worker.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            await worker.start()
            try:
                yield
            finally:
                await worker.close()

    app = FastAPI(title="OpenDDE Workbench", version=__version__, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": item["loc"], "msg": item["msg"], "type": item["type"]}
                    for item in exc.errors()
                ]
            },
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH"}:
            length = request.headers.get("content-length", "")
            if not length.isdigit() or int(length) > 262144:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body exceeds 256 KiB or has no fixed length."},
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        frame_ancestors = "'self'" if request.url.path == "/viewer.html" else "'none'"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self'; img-src 'self' data:; "
            "script-src 'self'; worker-src 'self' blob:; style-src-attr 'unsafe-inline'; "
            f"frame-ancestors {frame_ancestors}; base-uri 'none'"
        )
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def mutation(request: Request, x_workbench_csrf: str = Header(default="")):
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            raise HTTPException(403, "Origin is not allowed.")
        if not secrets.compare_digest(csrf, x_workbench_csrf):
            raise HTTPException(403, "Refresh the page before submitting this request.")

    def required(job_id: UUID) -> Job:
        job = store.get(str(job_id))
        if job is None:
            raise HTTPException(404, "Task not found.")
        return job

    async def enqueue(prediction: Prediction, key: UUID, parent: str | None = None):
        if worker.error:
            raise HTTPException(503, worker.error)
        readiness = await health()
        if not readiness["worker_ready"]:
            raise HTTPException(503, "Task worker is not available.")
        if not readiness["engine"]["ready"]:
            raise HTTPException(503, readiness["engine"]["reason"])
        if prediction.parameters.model == "abag" and not readiness["engine"].get("models", {}).get(
            "abag"
        ):
            raise HTTPException(
                503,
                "The ABAG checkpoint is not available. "
                "Select the standard model or install the ABAG checkpoint.",
            )
        capacity = settings.capacity_dir or settings.state_dir
        if (
            min(shutil.disk_usage(settings.state_dir).free, shutil.disk_usage(capacity).free)
            < settings.minimum_free_bytes
        ):
            raise HTTPException(507, "At least 2 GiB free disk space is required.")
        if prediction.project_id is not None:
            with store.connect() as db:
                if not db.execute(
                    "SELECT 1 FROM projects WHERE id=?", (str(prediction.project_id),)
                ).fetchone():
                    raise HTTPException(422, "Selected project does not exist.")
        if isinstance(engine, DockerEngine) and prediction.parameters.model == "abag":
            if not (settings.model_dir / "checkpoint/opendde_abag.pt").is_file():
                raise HTTPException(503, "ABAG checkpoint is not installed.")
        try:
            return store.create(
                prediction, str(key), settings.max_pending, settings.max_jobs, parent
            )
        except ConflictError as error:
            raise HTTPException(409, str(error)) from error
        except CapacityError as error:
            raise HTTPException(429, str(error)) from error

    @app.get("/api/session")
    def session():
        return {"csrf_token": csrf, "version": __version__}

    @app.get("/api/health")
    async def health():
        if time.monotonic() > health_cache["expires"]:
            health_cache["value"] = await engine.readiness()
            health_cache["expires"] = time.monotonic() + 10
        alive = worker.task is not None and not worker.task.done()
        return {
            "version": __version__,
            "engine": health_cache["value"],
            "worker_ready": alive and not worker.error,
            "worker_error": worker.error,
            "disk_total_gib": round(
                shutil.disk_usage(settings.capacity_dir or settings.state_dir).total / 1024**3, 1
            ),
            "free_disk_gib": round(
                min(
                    shutil.disk_usage(settings.state_dir).free,
                    shutil.disk_usage(settings.capacity_dir or settings.state_dir).free,
                )
                / 1024**3,
                1,
            ),
            "capabilities": {"prediction": True, "msa": False, "templates": False, "llm": False},
        }

    @app.get("/api/jobs", response_model=list[Job])
    def jobs(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=10000)):
        return store.list_jobs(limit, offset)

    @app.post("/api/jobs", response_model=Job, status_code=201, dependencies=[Depends(mutation)])
    async def submit(prediction: Prediction, idempotency_key: Annotated[UUID, Header()]):
        return await enqueue(prediction, idempotency_key)

    @app.get("/api/jobs/{job_id}", response_model=Job)
    def detail(job_id: UUID):
        return required(job_id)

    @app.post("/api/jobs/{job_id}/cancel", response_model=Job, dependencies=[Depends(mutation)])
    def cancel(job_id: UUID):
        required(job_id)
        return store.cancel(str(job_id))

    @app.post(
        "/api/jobs/{job_id}/retry",
        response_model=Job,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    async def retry(job_id: UUID, idempotency_key: Annotated[UUID, Header()]):
        job = required(job_id)
        if job.status not in TERMINAL:
            raise HTTPException(409, "Only finished tasks can be retried.")
        return await enqueue(job.request, idempotency_key, job.id)

    @app.get("/api/jobs/{job_id}/logs")
    def logs(job_id: UUID):
        required(job_id)
        return log_tail(settings.state_dir / "jobs" / str(job_id) / "run.log")

    @app.get("/api/jobs/{job_id}/artifacts")
    def artifacts(job_id: UUID):
        job = required(job_id)
        if job.status not in TERMINAL:
            return []
        return list_artifacts(settings.state_dir / "jobs" / str(job_id) / "output")

    @app.get("/api/jobs/{job_id}/download")
    def download(job_id: UUID, name: str = Query(min_length=1, max_length=500)):
        job = required(job_id)
        if job.status not in TERMINAL:
            raise HTTPException(409, "Wait for the task to finish before downloading results.")
        try:
            path = contained(settings.state_dir / "jobs" / str(job_id) / "output", name)
        except (ValueError, FileNotFoundError) as error:
            raise HTTPException(404, "Artifact not found.") from error
        return FileResponse(path, filename=path.name, media_type="application/octet-stream")

    @app.get("/api/jobs/{job_id}/input")
    def input_document(job_id: UUID):
        job = required(job_id)
        return JSONResponse(
            job.request.inference_input(job.id),
            headers={"Content-Disposition": f'attachment; filename="{job.id}-input.json"'},
        )

    register_projects(app, store, mutation)
    register_science(app, store, engine, settings)
    web = Path(__file__).parent / "web"
    if web.is_dir():
        app.mount("/", StaticFiles(directory=web, html=True), name="web")
    return app
