from unittest.mock import Mock

import pytest

from opendde_workbench.deployment.compute_service import ComputeService
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.store import Store


@pytest.mark.parametrize("state", ["dispatching", "uncertain"])
@pytest.mark.parametrize("missing_harness", [False, True])
def test_compute_stop_protects_native_launch_without_known_task_id(
    settings, client_factory, monkeypatch, state, missing_harness, tmp_path
):
    lifecycle = Mock(return_value={"configured": True, "running": False, "ready": False})
    harness_python = tmp_path / "missing-harness" / "python" if missing_harness else None
    with client_factory(harness_python=harness_python) as client:
        monkeypatch.setattr(ComputeService, "invoke", lifecycle)
        store = Store(settings.state_dir / "jobs.sqlite3")
        with store.connect() as db:
            db.execute(
                "INSERT INTO design_plans VALUES ('plan','key','{}','digest',?,NULL,NULL,'today')",
                (state,),
            )
        blocked = client.post("/api/deployment/compute/stop", json={})
        assert blocked.status_code == 409
        assert "Finish scientific tasks" in blocked.json()["detail"]
        lifecycle.assert_not_called()
        with store.connect() as db:
            db.execute("UPDATE design_plans SET state='validated' WHERE id='plan'")
        stopped = client.post("/api/deployment/compute/stop", json={})
        assert stopped.status_code == 200
        assert stopped.json()["running"] is False
        lifecycle.assert_called_once_with("stop")


def test_component_repair_remains_available_if_harness_executable_is_missing(
    client_factory, monkeypatch, tmp_path
):
    enqueue = Mock(return_value=["queued-repair"])
    with client_factory(harness_python=tmp_path / "missing-harness" / "python") as client:
        monkeypatch.setattr(DeploymentManager, "enqueue", enqueue)
        result = client.post("/api/deployment/packages/harness/repair", json={})
        assert result.status_code == 200
        assert result.json() == {"operations": ["queued-repair"]}
        enqueue.assert_called_once_with("harness", "repair")
