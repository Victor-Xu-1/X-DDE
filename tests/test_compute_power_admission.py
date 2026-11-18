from unittest.mock import Mock

import pytest

from opendde_workbench.deployment.compute_service import ComputeService
from opendde_workbench.store import Store


@pytest.mark.parametrize("state", ["dispatching", "uncertain"])
def test_compute_stop_protects_native_launch_without_known_task_id(
    settings, client_factory, monkeypatch, state
):
    lifecycle = Mock(return_value={"configured": True, "running": False, "ready": False})
    with client_factory() as client:
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
