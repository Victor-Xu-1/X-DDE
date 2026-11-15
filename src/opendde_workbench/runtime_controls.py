"""Session-scoped permission for managed task engines; no eager model loading.

BackendRouter still owns every process. Enabling permits on-demand task execution;
disabling prevents new work, and existing task cleanup releases native resources.
Permissions are deliberately not persisted across platform restarts.
"""

from fastapi import Depends, HTTPException

from .engine_registry import ENGINES, engine_for, statuses


class RuntimeControls:
    def __init__(self, store):
        self.store = store
        self.enabled: set[str] = set()

    def reason(self, job):
        owner = engine_for(job.request.operation)
        if owner.id not in self.enabled:
            return f"Enable {owner.name} in Backend controls before running this task."
        return None

    def next_queued(self):
        operations = tuple(op for key in self.enabled for op in ENGINES[key].operations)
        return self.store.next_queued(operations)

    def native_reason(self):
        return None if "harness" in self.enabled else "Enable OpenDDE Harness in Backend controls."

    def active_engines(self):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM jobs WHERE status IN ('running', 'cancelling', 'paused')"
            ).fetchall()
        return {engine_for(self.store.decode(row).request.operation).id for row in rows}

    def change(self, identifier, action, ready):
        if identifier not in ENGINES or action not in {"start", "stop"}:
            raise HTTPException(404, "Unknown backend action.")
        if action == "start":
            if not ready:
                raise HTTPException(409, "This backend is not available. Check its installation.")
            self.enabled.add(identifier)
        else:
            if identifier in self.active_engines():
                raise HTTPException(409, "Stop this backend's active task before switching it off.")
            self.enabled.discard(identifier)


def register_runtime_controls(app, store, engine, worker, health, mutation, harness=None):
    from .backend_router import BackendRouter

    # Explicitly injected engines retain their own lifecycle contract.
    managed = isinstance(engine, BackendRouter)
    controls = RuntimeControls(store)
    if managed:
        engine.admission = controls.reason
        worker.select_queued = controls.next_queued
        if harness is not None:
            harness.admission = controls.native_reason
        previous_gate = worker.gate

        async def gate(job):
            reason = controls.reason(job)
            if reason:
                return reason
            native = await previous_gate(job) if previous_gate else None
            # An explicit switch-off can arrive during the native activity probe.
            return controls.reason(job) or native

        worker.gate = gate

    @app.get("/api/runtime-controls")
    async def snapshot():
        state = await health()
        active = controls.active_engines()
        if harness is not None and await harness.runtime_busy():
            active.add("harness")
        return {
            "engines": [
                {
                    "id": key,
                    "name": item["name"],
                    "ready": managed and item["ready"],
                    "enabled": key in controls.enabled,
                    "active": key in active,
                }
                for key, item in statuses(state["engine"]).items()
            ]
        }

    @app.post("/api/runtime-controls/{identifier}/{action}", dependencies=[Depends(mutation)])
    async def change(identifier: str, action: str):
        if not managed:
            raise HTTPException(409, "This runtime supplies its own controls.")
        state = await health() if action == "start" else None
        ready = bool(state and statuses(state["engine"]).get(identifier, {}).get("ready"))
        if action == "stop" and identifier == "harness" and harness is not None:
            if await harness.runtime_busy():
                raise HTTPException(409, "Stop the active native design campaign first.")
        controls.change(identifier, action, ready)
        return {"enabled": identifier in controls.enabled}

    return controls
