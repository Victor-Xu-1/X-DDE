"""Atomic deployment settings and a persistent installation queue."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from ..locations import atomic_json, read_json
from ..store import now
from .catalog import PACKAGES, dependencies

ACTIVE = {"queued", "running", "pausing"}


def managed_root(value: str, *, create: bool = True) -> Path:
    # A selected base directory is never itself owned or removed by this app.
    base = Path(value).expanduser()
    if not base.is_absolute() or any(c in str(base) for c in ("\x00", "\n", "\r", ",")):
        raise ValueError(
            "Choose an absolute Linux/WSL directory, without commas or control characters."
        )
    if ".." in base.parts:
        raise ValueError("Parent-directory segments are not allowed.")
    resolved = base.resolve()
    if resolved in {
        Path("/"),
        Path("/etc"),
        Path("/usr"),
        Path("/bin"),
        Path("/var"),
        Path("/proc"),
        Path("/sys"),
    }:
        raise ValueError("Choose a data folder, not a system directory.")
    root = resolved / "x-dde-managed"
    legacy = resolved / "opendde-managed"

    def present(path: Path) -> bool:
        return path.exists() or path.is_symlink()

    if present(root) and present(legacy):
        raise ValueError("Both X-DDE and legacy managed directories exist; review their ownership.")
    if present(legacy):
        root = legacy
    if root.is_symlink():
        raise ValueError("The managed directory cannot be a symlink.")
    if not root.exists():
        if not create:
            return root
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker = root / ".workbench-owner.json"
    if not marker.exists():
        if any(root.iterdir()):
            raise ValueError("This directory contains unowned files; choose another location.")
        if create:
            atomic_json(marker, {"owner": "X-DDE", "id": str(uuid4())})
        else:
            return root
    owners = {"X-DDE"}
    if root.name == "opendde-managed":
        owners.add("opendde-workbench")
    if read_json(marker).get("owner") not in owners:
        raise ValueError("The directory does not belong to X-DDE.")
    return root


class DeployStore:
    def __init__(self, state: Path):
        self.state = state
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = state / "deployments.sqlite3"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(
                "CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, package TEXT, "
                "action TEXT, state TEXT, stage TEXT, error TEXT, created TEXT, updated TEXT)"
            )

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def rows(self):
        with self.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM operations WHERE "
                    "state IN ('queued','running','pausing','paused') "
                    "OR id IN (SELECT id FROM operations ORDER BY created DESC LIMIT 100) "
                    "ORDER BY created DESC"
                )
            ]

    def update(self, identifier: str, **values):
        if set(values) - {"state", "stage", "error"}:
            raise ValueError("Unknown deployment state field.")
        with self.connect() as db:
            db.execute(
                "UPDATE operations SET "
                + ",".join(f"{k}=?" for k in values)
                + ",updated=? WHERE id=?",
                (*values.values(), now(), identifier),
            )

    def enqueue(self, package: str, action: str, installed: dict):
        if package not in PACKAGES or action not in {"install", "upgrade", "uninstall"}:
            raise ValueError("Unknown package or action.")
        plan = dependencies(package) if action != "uninstall" else [package]
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if action == "uninstall":
                if db.execute(
                    "SELECT 1 FROM operations WHERE "
                    "state IN ('queued','running','pausing','paused')"
                ).fetchone():
                    raise ValueError("Finish or cancel other deployments before uninstalling.")
                users = [
                    key for key in installed if key != package and package in dependencies(key)
                ]
                if users:
                    raise ValueError("Remove dependent components first: " + ", ".join(users))
            count = db.execute(
                "SELECT count(*) FROM operations WHERE state IN "
                "('queued','running','pausing','paused')"
            ).fetchone()[0]
            if count + len(plan) > 50:
                raise ValueError("Deployment queue is full. Complete or cancel pending operations.")
            ids = []
            for key in plan:
                active = db.execute(
                    "SELECT id FROM operations WHERE package=? AND state IN "
                    "('queued','running','pausing','paused')",
                    (key,),
                ).fetchone()
                if active:
                    ids.append(active[0])
                    continue
                if key != package and key in installed:
                    continue
                identifier = str(uuid4())
                db.execute(
                    "INSERT INTO operations VALUES(?,?,?,?,?,?,?,?)",
                    (
                        identifier,
                        key,
                        action if key == package else "install",
                        "queued",
                        "Waiting",
                        None,
                        now(),
                        now(),
                    ),
                )
                ids.append(identifier)
            return ids

    def get(self, identifier: str):
        with self.connect() as db:
            row = db.execute("SELECT * FROM operations WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError("Deployment not found.")
        return dict(row)

    def config(self):
        return read_json(self.state / "deployment.json")

    def installed(self):
        config = self.config()
        if not config:
            return {}
        return read_json(Path(config["root"]) / "installed.json")
