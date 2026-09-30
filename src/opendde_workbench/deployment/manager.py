"""Single durable installer queue, independent of scientific task execution."""

import asyncio
import fcntl
import os
import shutil
import threading
from pathlib import Path

from ..locations import atomic_json, home
from .catalog import PACKAGES, catalogue, prerequisites
from .installers import install
from .paths import environment_root
from .process import Paused, reap
from .storage import ACTIVE, DeployStore, managed_root


class DeploymentManager:
    def __init__(self, state: Path):
        self.store = DeployStore(state)
        self.closing = threading.Event()
        self.mutex = threading.RLock()
        self.task = None
        self.activated = {
            k: v for k, v in self.store.installed().items() if k not in {"ketcher", "molstar"}
        }

    async def start(self):
        # Reap only children with a matching saved kernel start time.
        config = self.store.config()
        for row in self.store.rows():
            if row["state"] in {"running", "pausing"}:
                if config:
                    reap(Path(config["root"]) / "operations" / row["id"] / "process.json")
                self.store.update(
                    row["id"], state="paused", stage="Interrupted; resume to continue"
                )
        if not config and os.environ.get("WB_AUTO_DEPLOY") == "1":
            self.configure(str(home() / "components"), True)
            # Editors first so a large compute image never blocks the first useful screen.
            for key in ("ketcher", "molstar", "harness", "runtime", "compute"):
                self.enqueue(key, "install")
        self.task = asyncio.create_task(self.loop())

    async def close(self):
        self.closing.set()
        if self.task:
            await self.task

    def configure(self, location: str, automatic: bool):
        with self.mutex:
            config = self.store.config()
            root = managed_root(location)
            if (
                config
                and config["root"] != str(root)
                and (
                    self.store.installed()
                    or any(r["state"] in ACTIVE | {"paused"} for r in self.store.rows())
                )
            ):
                raise ValueError(
                    "Uninstall components and cancel queued installs before changing location. "
                    "Models and results are retained at the old location."
                )
            atomic_json(
                self.store.state / "deployment.json", {"root": str(root), "automatic": automatic}
            )
            return self.snapshot()

    def snapshot(self):
        config = self.store.config()
        return {
            "config": config,
            "installed": self.store.installed(),
            "operations": self.store.rows(),
            "packages": catalogue(),
            "prerequisites": prerequisites(),
            "default_location": str(home() / "components"),
            "locations": [str(home() / "components")]
            + [str(p / "OpenDDE") for p in Path("/mnt").glob("[a-z]") if p.is_dir()],
            "restart_required": self.activated
            != {k: v for k, v in self.store.installed().items() if k not in {"ketcher", "molstar"}},
        }

    def enqueue(self, package, action):
        with self.mutex:
            if not self.store.config():
                raise ValueError("Choose and save an installation location first.")
            return self.store.enqueue(package, action, self.store.installed())

    def control(self, identifier, action):
        with self.mutex:
            row = self.store.get(identifier)
            if action == "pause" and row["state"] in {"queued", "running"}:
                self.store.update(
                    identifier, state="pausing" if row["state"] == "running" else "paused"
                )
            elif action == "resume" and row["state"] in {"paused", "failed"}:
                self.store.update(identifier, state="queued", error=None, stage="Waiting")
            elif action == "cancel" and row["state"] in {"paused", "failed", "queued"}:
                self.store.update(
                    identifier, state="cancelled", stage="Cancelled; cached downloads retained"
                )
            else:
                raise ValueError("This action is not available in the current state.")

    async def loop(self):
        while not self.closing.is_set():
            await asyncio.to_thread(self.tick)
            await asyncio.sleep(0.5)

    def tick(self):
        config = self.store.config()
        if not config:
            return
        with (Path(config["root"]) / "install.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            self._tick()

    def _tick(self):
        with self.mutex:
            installed = self.store.installed()
            row = next(
                (
                    r
                    for r in reversed(self.store.rows())
                    if r["state"] == "queued"
                    and (
                        r["action"] == "uninstall"
                        or all(d in installed for d in PACKAGES[r["package"]].dependencies)
                    )
                ),
                None,
            )
            if not row:
                return
            identifier, key = row["id"], row["package"]
            self.store.update(identifier, state="running", stage="Starting")
            root = Path(self.store.config()["root"])

        def checkpoint():
            if self.closing.is_set() or self.store.get(identifier)["state"] == "pausing":
                raise Paused()

        def report(value):
            self.store.update(identifier, stage=value)

        try:
            if row["action"] == "uninstall":
                entry = installed.get(key, {})
                # Only versioned package files are removed. Models and Docker layers may be shared.
                if entry.get("directory"):
                    directory = Path(entry["directory"])
                    parent = environment_root(root) if key == "harness" else root / "packages" / key
                    if directory.is_symlink() or directory.resolve().parent != parent.resolve():
                        raise ValueError(
                            "Refusing to remove a path outside the owned package folder."
                        )
                    if directory.exists():
                        shutil.rmtree(directory)
                installed.pop(key, None)
            else:
                installed[key] = install(key, root, installed, identifier, report, checkpoint)
            with self.mutex:
                atomic_json(root / "installed.json", installed)
                self.store.update(
                    identifier,
                    state="succeeded",
                    stage="Uninstalled; models, caches and shared Docker layers retained"
                    if row["action"] == "uninstall"
                    else "Installed; restart UI to activate compute changes",
                )
        except Paused:
            self.store.update(
                identifier, state="paused", stage="Paused; verified downloads can be reused"
            )
        except Exception as exc:
            self.store.update(
                identifier, state="failed", stage="Installation stopped", error=str(exc)[:1500]
            )
