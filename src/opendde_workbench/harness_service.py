"""Bounded IPC and durable, idempotent handoffs to native campaigns."""

import asyncio
import hashlib
import json
import time
from pathlib import Path
from uuid import uuid4

from .harness_contract import FILE_FIELDS, asset_references, validate_payload
from .harness_process import environment, start_time
from .managed_files import publish_shared
from .store import ConflictError, now


class HarnessService:
    def __init__(self, settings, store, assets):
        self.settings, self.store, self.assets = settings, store, assets
        self.limit = asyncio.Semaphore(2)
        self.active_cache = (0.0, False)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS design_plans(id TEXT PRIMARY KEY,"
                "idempotency_key TEXT UNIQUE NOT NULL,config TEXT NOT NULL,digest TEXT NOT NULL,"
                "state TEXT NOT NULL,task_id TEXT,summary TEXT,created_at TEXT NOT NULL)"
            )

    async def invoke(self, message, timeout=45):
        python = self.settings.harness_python
        if not python or not python.is_file():
            raise RuntimeError(
                "Configure WB_HARNESS_PYTHON with the installed OpenDDE Harness environment."
            )
        async with self.limit:
            process = await asyncio.create_subprocess_exec(
                str(python),
                str(Path(__file__).with_name("harness_bridge.py")),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=environment(self.settings),
                cwd=self.settings.state_dir,
            )
            if message.get("operation") == "start":
                # Persist identity before sending stdin: a crash before this write cannot launch.
                identity = Path(message["config_path"]).with_name("launch-process.json")
                try:
                    identity.write_text(
                        json.dumps({"pid": process.pid, "start_time": start_time(process.pid)})
                    )
                except BaseException:
                    if process.returncode is None:
                        process.kill()
                    await process.wait()
                    raise

            async def read():
                process.stdin.write(json.dumps(message).encode())
                await process.stdin.drain()
                process.stdin.close()
                data = bytearray()
                while chunk := await process.stdout.read(65536):
                    data.extend(chunk)
                    limit = (
                        32 * 1024**2
                        if message["operation"] == "candidate_structure"
                        else 4 * 1024**2
                    )
                    if len(data) > limit:
                        raise ValueError("Harness response exceeds the bounded display limit.")
                await process.wait()
                return data

            try:
                body = await asyncio.wait_for(read(), timeout)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                await process.wait()
                raise
        if process.returncode:
            raise RuntimeError(
                "Harness bridge failed. Check its installation and default configuration."
            )
        data = json.loads(body)
        if not data.get("ok"):
            # Never return credentials even when an upstream exception embeds configuration.
            error = str(data.get("error", "Native Harness operation failed."))
            if self.settings.harness_token:
                error = error.replace(self.settings.harness_token, "[redacted]")
            raise ValueError(error)
        return data["result"]

    def plan(self, identifier):
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM design_plans WHERE id=?", (str(identifier),)).fetchone()
        if not row:
            raise KeyError("Design plan not found.")
        return dict(row)

    def config_path(self, plan):
        directory = self.settings.state_dir / "design-plans" / plan["id"]
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = directory / "design.json"

        # JSON is also valid YAML. Native loader is the only scientific normalization authority.
        def resolve(value, key=""):
            if key in FILE_FIELDS:

                def copy(reference):
                    asset = self.assets.get(reference[6:])
                    shared = self.settings.harness_shared_dir
                    if shared is None:
                        raise ValueError(
                            "Configure Harness shared storage before using uploaded campaign files."
                        )
                    return publish_shared(
                        self.assets.path(asset),
                        "workbench-plan-" + plan["id"] + "-" + asset.id,
                        shared,
                        self.settings.harness_remote_dir or str(shared),
                        asset.sha256,
                    )

                return [copy(v) for v in value] if isinstance(value, list) else copy(value)
            if isinstance(value, dict):
                return {k: resolve(v, k) for k, v in value.items()}
            if isinstance(value, list):
                return [resolve(v) for v in value]
            return value

        path.write_text(
            json.dumps(resolve(json.loads(plan["config"])), ensure_ascii=False), encoding="utf-8"
        )
        return str(path)

    async def validate(self, config, key):
        validate_payload(config)
        design = config.get("design", {})
        if (
            not 1 <= int(design.get("n_cycles", 3)) <= 100
            or not 1 <= int(design.get("num_sequences", 8)) <= 256
        ):
            raise ValueError("Use1–100 cycles and1–256 proposals per cycle.")
        canonical = json.dumps(config, sort_keys=True, ensure_ascii=False, allow_nan=False)
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for _, identifier in asset_references(config):
                if not db.execute("SELECT 1 FROM assets WHERE id=?", (identifier,)).fetchone():
                    raise ValueError("An uploaded design input is missing. Upload it again.")
            old = db.execute(
                "SELECT * FROM design_plans WHERE idempotency_key=?", (str(key),)
            ).fetchone()
            if old:
                if old["digest"] != digest:
                    raise ConflictError("Validation key was used for another design.")
                plan = dict(old)
            else:
                identifier = str(uuid4())
                stored = {
                    **config,
                    "benchmark_metadata": {
                        **config.get("benchmark_metadata", {}),
                        "workbench_plan_id": identifier,
                    },
                }
                db.execute(
                    "INSERT INTO design_plans(id,idempotency_key,config,digest,state,created_at) "
                    "VALUES(?,?,?,?,?,?)",
                    (
                        identifier,
                        str(key),
                        json.dumps(stored, ensure_ascii=False),
                        digest,
                        "draft",
                        now(),
                    ),
                )
                plan = self.plan_in(db, identifier)
        if plan["state"] == "draft":
            result = await self.invoke(
                {"operation": "validate", "config_path": self.config_path(plan)}
            )
            with self.store.connect() as db:
                db.execute(
                    "UPDATE design_plans SET state='validated',summary=? "
                    "WHERE id=? AND state='draft'",
                    (json.dumps(result["summary"]), plan["id"]),
                )
        return self.public(self.plan(plan["id"]))

    @staticmethod
    def plan_in(db, identifier):
        row = db.execute("SELECT * FROM design_plans WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError("Design plan not found.")
        return dict(row)

    @staticmethod
    def public(plan):
        return {
            "id": plan["id"],
            "digest": plan["digest"],
            "state": plan["state"],
            "task_id": plan["task_id"],
            "summary": json.loads(plan["summary"]) if plan["summary"] else None,
            "config": json.loads(plan["config"]),
        }

    async def start(self, identifier, digest, reconcile=False):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            plan = self.plan_in(db, str(identifier))
            if plan["digest"] != digest:
                raise ConflictError("Review the latest plan before starting.")
            if plan["task_id"]:
                return self.public(plan)
            if reconcile and self.launch_alive(plan):
                raise ConflictError(
                    "The original native launch is still in progress. Wait before reconciling."
                )
            if not reconcile:
                requests = db.execute(
                    "SELECT request FROM jobs WHERE status IN ('queued','running','cancelling')"
                ).fetchall()
                if any(
                    json.loads(row["request"]).get("operation", "predict")
                    in {"predict", "resources"}
                    for row in requests
                ):
                    raise ConflictError(
                        "Wait for queued OpenDDE predictions/resource tasks "
                        "before starting a design campaign."
                    )
            if not reconcile and plan["state"] != "validated":
                raise ConflictError(
                    "This plan was already dispatched. "
                    "Reconcile its native task instead of launching again."
                )
            if not reconcile:
                db.execute(
                    "UPDATE design_plans SET state='dispatching' WHERE id=?", (str(identifier),)
                )
                self.active_cache = (0.0, True)
        try:
            message = (
                {"operation": "reconcile", "plan_id": plan["id"]}
                if reconcile
                else {
                    "operation": "start",
                    "config_path": self.config_path(plan),
                    "plan_id": plan["id"],
                }
            )
            result = await self.invoke(message, timeout=120)
            if result.get("found") is False:
                with self.store.connect() as db:
                    db.execute(
                        "UPDATE design_plans SET state='validated' WHERE id=? AND task_id IS NULL",
                        (str(identifier),),
                    )
                return self.public(self.plan(identifier))
        except BaseException:
            with self.store.connect() as db:
                db.execute(
                    "UPDATE design_plans SET state='uncertain' WHERE id=? AND task_id IS NULL",
                    (str(identifier),),
                )
            raise
        with self.store.connect() as db:
            db.execute(
                "UPDATE design_plans SET state='started',task_id=? WHERE id=?",
                (result["task_id"], str(identifier)),
            )
        return self.public(self.plan(identifier))

    def launch_alive(self, plan):
        path = self.settings.state_dir / "design-plans" / plan["id"] / "launch-process.json"
        if not path.is_file():
            return False
        data = json.loads(path.read_text())
        try:
            return (
                start_time(data["pid"]) == data["start_time"]
                and b"harness_bridge.py" in Path(f"/proc/{data['pid']}/cmdline").read_bytes()
            )
        except FileNotFoundError:
            return False

    async def queue_gate(self, job):
        if (
            job.request.operation not in {"predict", "resources"}
            or not self.settings.harness_python
        ):
            return None
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT state,task_id FROM design_plans "
                "WHERE state IN ('dispatching','uncertain','started')"
            ).fetchall()
        if any(row["state"] in {"dispatching", "uncertain"} for row in rows):
            return (
                "A native design launch is pending reconciliation. "
                "Open Antibody design to reconcile it."
            )
        if not rows:
            return None
        timestamp, active = self.active_cache
        if time.monotonic() - timestamp > 5:
            active = bool(await self.invoke({"operation": "active"}, timeout=15))
            self.active_cache = (time.monotonic(), active)
        return (
            "Waiting for the native antibody-design campaign to release compute resources."
            if active
            else None
        )
