"""Loopback API: validated requests, same-origin mutations, safe result downloads."""

import asyncio
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

from . import PRODUCT_NAME, __version__
from .artifacts import contained, list_artifacts, log_tail
from .asset_routes import register_assets
from .assets import AssetStore
from .backend_router import BackendRouter
from .capabilities import register_capabilities
from .checkpoints import registered, resolve
from .deployment.manager import DeploymentManager
from .deployment.provisioners import states as provisioner_states
from .deployment.routes import register_deployments
from .diffsbdd.runtime import validate as validate_diffsbdd
from .docking.runtime import validate as validate_docking
from .engine import Engine
from .engine_registry import statuses as engine_statuses
from .execution_environment import EnvironmentRecord
from .harness_routes import register_harness
from .models import TERMINAL, Job
from .operation_routes import register_operations
from .pockets.runtime import validate as validate_pockets
from .prediction import Prediction
from .preflight import check
from .projects import register_projects
from .requests import BatchRequest, TaskRequest
from .research.region_routes import register_regions
from .research.routes import register_research
from .science_routes import register_science
from .settings import Settings
from .store import CapacityError, ConflictError, Store
from .worker import Worker
from .workflows import register_workflows


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    store = Store(settings.state_dir / "jobs.sqlite3")
    engine = engine or BackendRouter(settings)
    assets = AssetStore(store, settings.state_dir / "assets")
    worker = Worker(store, engine, settings, assets)
    deployments = DeploymentManager(settings.state_dir)
    csrf = secrets.token_urlsafe(32)
    mutations = asyncio.Lock()
    health_cache = {"expires": 0.0, "value": None}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        with (settings.state_dir / "worker.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            await worker.start()
            await deployments.start()
            try:
                yield
            finally:
                await deployments.close()
                await worker.close()

    app = FastAPI(title=PRODUCT_NAME, version=__version__, lifespan=lifespan)
    app.state.quiescing = False
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
            limit = (
                25 * 1024**2
                if request.url.path == "/api/assets"
                else 2 * 1024**2
                if request.url.path == "/api/batches"
                else 262144
            )
            if not length.isdigit() or int(length) > limit:
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Request body exceeds the size limit or has no fixed length."
                    },
                )
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            async with mutations:
                if app.state.quiescing:
                    return JSONResponse(status_code=409, content={"detail": "UI is shutting down."})
                if (
                    request.url.path.startswith("/api/harness/")
                    and request.url.path.endswith("/start")
                    and any(
                        r["state"] in {"queued", "running", "pausing"}
                        and r["package"] not in {"ketcher", "molstar"}
                        for r in deployments.store.rows()
                    )
                ):
                    return JSONResponse(
                        status_code=409,
                        content={"detail": "Wait or pause component deployment first."},
                    )
                response = await call_next(request)
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        editor = request.url.path.startswith("/tools/") or request.url.path == "/molecular.html"
        frame_ancestors = "'self'" if request.url.path == "/viewer.html" or editor else "'none'"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self'; img-src 'self' data:; "
            "script-src 'self'; worker-src 'self' blob:; style-src-attr 'unsafe-inline'; "
            f"frame-ancestors {frame_ancestors}; base-uri 'none'"
        )
        if editor:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
                "font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; "
                "frame-ancestors 'self'; base-uri 'self'"
            )
        if request.url.path == "/molecular.html":
            # Mol* uses generated query functions. Restrict this permission to an opaque-origin
            # sandbox: it cannot read the parent, session token, uploads or other app state.
            response.headers["Content-Security-Policy"] = (
                response.headers["Content-Security-Policy"].replace(
                    "'wasm-unsafe-eval'", "'unsafe-eval'"
                )
                + "; sandbox allow-scripts allow-downloads"
            )
        if request.url.path.startswith(("/assets/", "/tools/molstar/")):
            response.headers["Access-Control-Allow-Origin"] = "*"
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

    async def preflight(value: TaskRequest):
        if any(
            r["state"] in {"queued", "running", "pausing"}
            and r["package"] not in {"ketcher", "molstar"}
            for r in deployments.store.rows()
        ):
            raise HTTPException(
                409,
                "Compute components are being deployed. Wait or pause deployment "
                "before submitting a scientific task.",
            )
        readiness = await health()
        if not readiness["worker_ready"]:
            raise HTTPException(503, worker.error or "Task worker is not available.")
        try:
            if value.operation == "harness":
                assets.validate_bindings(value)
                if (
                    not settings.harness_python
                    or not settings.harness_python.is_file()
                    or value.tool != "compare"
                    and not settings.harness_url
                ):
                    raise RuntimeError(
                        "Configure the Harness interpreter and compute URL in server settings."
                    )
                await harness_service.invoke(
                    {"operation": "validate_tool", "tool": value.tool, "payload": value.payload}
                )
            elif value.operation == "docking":
                assets.validate_bindings(value)
                validate_docking(value, readiness["engine"].get("backends", {}).get("gnina", {}))
            elif value.operation == "pocket_search":
                assets.validate_bindings(value)
                validate_pockets(value, readiness["engine"].get("backends", {}).get("p2rank", {}))
            elif value.operation == "diffsbdd":
                assets.validate_bindings(value)
                regions.check_task(value)
                validate_diffsbdd(
                    value, readiness["engine"].get("backends", {}).get("diffsbdd", {})
                )
            else:
                check(value, readiness["engine"], assets)
                if value.operation == "predict" and value.parameters.checkpoint_id:
                    resolve(settings, value.parameters.checkpoint_id)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc
        except (RuntimeError, OSError, TimeoutError) as exc:
            raise HTTPException(503, str(exc)) from exc
        capacity = settings.capacity_dir or settings.state_dir
        if (
            min(shutil.disk_usage(settings.state_dir).free, shutil.disk_usage(capacity).free)
            < settings.minimum_free_bytes
        ):
            raise HTTPException(507, "At least2GiB free disk space is required.")
        if value.project_id is not None:
            with store.connect() as db:
                if not db.execute(
                    "SELECT 1 FROM projects WHERE id=?", (str(value.project_id),)
                ).fetchone():
                    raise HTTPException(422, "Selected project does not exist.")

    async def enqueue(value: TaskRequest, key: UUID, parent: str | None = None):
        await preflight(value)
        try:
            return store.create(value, str(key), settings.max_pending, settings.max_jobs, parent)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except CapacityError as exc:
            raise HTTPException(429, str(exc)) from exc

    @app.post(
        "/api/batches", response_model=list[Job], status_code=201, dependencies=[Depends(mutation)]
    )
    async def batch(value: BatchRequest, idempotency_key: Annotated[UUID, Header()]):
        for task in value.tasks:
            await preflight(task)
        try:
            return store.create_batch(
                value.tasks, idempotency_key, settings.max_pending, settings.max_jobs
            )
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except CapacityError as exc:
            raise HTTPException(429, str(exc)) from exc

    @app.get("/api/session")
    def session():
        import os

        return {
            "csrf_token": csrf,
            "version": __version__,
            "instance": os.environ.get("WB_INSTANCE", ""),
        }

    @app.get("/api/checkpoints")
    def checkpoints():
        try:
            return [
                {"id": identifier, "present": path.is_file()}
                for identifier, path in registered(settings).items()
            ]
        except (ValueError, OSError) as exc:
            raise HTTPException(
                503, "Checkpoint registry could not be read. Check server configuration."
            ) from exc

    @app.get("/api/health")
    async def health():
        if time.monotonic() > health_cache["expires"]:
            health_cache["value"] = await engine.readiness()
            health_cache["expires"] = time.monotonic() + 10
        alive = worker.task is not None and not worker.task.done()
        environments = engine_statuses(health_cache["value"])
        return {
            "version": __version__,
            "platform": {"name": PRODUCT_NAME, "ready": alive and not worker.error},
            "environments": environments,
            "engines": environments,
            "provisioners": provisioner_states(deployments.store.installed()),
            "engine": health_cache["value"],
            "worker_ready": alive and not worker.error,
            "worker_error": worker.error,
            "queue_wait_reason": worker.waiting_reason,
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
            "capabilities": {
                "prediction": True,
                "msa": True,
                "templates": True,
                "llm": settings.harness_python is not None,
            },
        }

    @app.get("/api/jobs", response_model=list[Job])
    def jobs(limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=10000)):
        return store.list_jobs(limit, offset)

    @app.post("/api/jobs", response_model=Job, status_code=201, dependencies=[Depends(mutation)])
    async def submit(prediction: TaskRequest, idempotency_key: Annotated[UUID, Header()]):
        return await enqueue(prediction, idempotency_key)

    @app.get("/api/jobs/{job_id}/environment", response_model=EnvironmentRecord)
    def execution_environment(job_id: UUID):
        required(job_id)
        record = store.environment(str(job_id))
        if record is None:
            raise HTTPException(404, "This task has no recorded environment binding.")
        return record

    @app.get("/api/jobs/{job_id}", response_model=Job)
    def detail(job_id: UUID):
        return required(job_id)

    @app.post("/api/jobs/{job_id}/cancel", response_model=Job, dependencies=[Depends(mutation)])
    def cancel(job_id: UUID):
        job = required(job_id)
        if (
            job.status == "running"
            and job.request.operation == "harness"
            and job.request.tool != "fold"
        ):
            raise HTTPException(
                409,
                "This native synchronous tool cannot be cancelled after dispatch. "
                "Wait for its result; queued tasks can be cancelled.",
            )
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
        path = settings.state_dir / "jobs" / job.id / "input.json"
        if path.is_file():
            try:
                path = contained(path.parent, "input.json")
            except (ValueError, FileNotFoundError) as exc:
                raise HTTPException(404, "Input artifact is unavailable.") from exc
            return FileResponse(
                path, filename=f"{job.id}-input.json", media_type="application/json"
            )
        if isinstance(job.request, Prediction):
            bindings = {
                identifier: "/job/assets/" + identifier + asset.suffix
                for identifier, asset in assets.validate_bindings(job.request).items()
            }
            return JSONResponse(
                job.request.inference_input(job.id, bindings),
                headers={"Content-Disposition": f'attachment; filename="{job.id}-input.json"'},
            )
        return JSONResponse(
            job.request.model_dump(mode="json"),
            headers={"Content-Disposition": f'attachment; filename="{job.id}-input.json"'},
        )

    register_assets(app, assets, mutation)
    harness_service = register_harness(app, store, assets, settings, mutation)

    async def scientific_busy():
        with store.connect() as db:
            active = db.execute(
                "SELECT 1 FROM jobs WHERE status IN ('queued','running','cancelling') LIMIT 1"
            ).fetchone()
        if active or workflows_service.records.runs({"running", "cancelling"}, limit=1):
            return True
        if settings.harness_python and settings.harness_python.is_file():
            try:
                return bool(await harness_service.invoke({"operation": "active"}, timeout=15))
            except (RuntimeError, ValueError, OSError, TimeoutError):
                raise HTTPException(
                    503, "Cannot verify native task state; retry after checking Harness."
                ) from None
        return False

    @app.get("/api/lifecycle")
    async def lifecycle():
        return {
            "busy": bool(
                any(
                    r["state"] in {"queued", "running", "pausing"} for r in deployments.store.rows()
                )
            )
            or await scientific_busy()
        }

    register_capabilities(app, settings, health)
    register_deployments(app, deployments, mutation, scientific_busy)

    @app.post("/api/lifecycle/stop", dependencies=[Depends(mutation)])
    async def prepare_shutdown():
        if (await lifecycle())["busy"]:
            raise HTTPException(409, "Pause deployments and stop scientific tasks before closing.")
        app.state.quiescing = True
        return {"busy": False}

    worker.gate = harness_service.queue_gate
    register_operations(app, store, assets, settings, mutation)
    register_research(app, store, assets, mutation)
    regions = register_regions(app, store, assets, settings, mutation)
    workflows_service = register_workflows(
        app, store, assets, worker, preflight, settings, mutation
    )
    register_projects(app, store, mutation)
    register_science(app, store, engine, settings)
    web = Path(__file__).parent / "web"
    if web.is_dir():
        app.mount("/", StaticFiles(directory=web, html=True), name="web")
    return app
