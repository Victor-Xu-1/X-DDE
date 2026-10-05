"""Platform identity and scientific engines have separate ownership and readiness."""

import asyncio
from types import SimpleNamespace

import pytest
from conftest import ProcessEngine

from opendde_workbench.backend_router import BackendRouter
from opendde_workbench.deployment.catalog import catalogue, dependencies
from opendde_workbench.engine_registry import ENGINES, engine_for
from opendde_workbench.requests import TASK_ADAPTER


def test_every_public_task_operation_has_one_registered_engine():
    operations = set()
    for definition in TASK_ADAPTER.json_schema()["$defs"].values():
        operation = definition.get("properties", {}).get("operation", {})
        if "const" in operation:
            operations.add(operation["const"])
        operations.update(operation.get("enum", []))
    registered = [operation for engine in ENGINES.values() for operation in engine.operations]
    assert len(registered) == len(set(registered))
    assert operations == set(registered)
    assert engine_for("predict").id == "opendde"
    assert engine_for("diffsbdd").id == "diffsbdd"
    assert engine_for("harness").id == "harness"
    with pytest.raises(ValueError, match="Unregistered scientific operation"):
        engine_for("unknown-future-engine")


def test_deployment_packages_belong_to_engines_or_editors():
    packages = catalogue()
    for package in packages:
        if package["kind"] == "editor":
            assert package["engine"] is None
        elif package["kind"] == "data":
            # Public cases are platform-owned data, not a scientific execution engine.
            assert package["engine"] == "x-dde"
        else:
            assert package["engine"] in ENGINES
    assert dependencies("diffsbdd") == ["diffsbdd"]
    assert all(
        package["engine"] == "diffsbdd"
        for package in packages
        if package["id"].startswith("diffsbdd")
    )


def test_real_xdde_server_remains_available_without_scientific_environments(
    client_factory, settings
):
    with client_factory(BackendRouter(settings)) as client:
        assert client.get("/openapi.json").json()["info"]["title"] == "X-DDE"
        health = client.get("/api/health").json()
        assert health["platform"] == {"name": "X-DDE", "ready": True}
        assert set(health["engines"]) == set(ENGINES)
        assert not any(
            state["ready"] for key, state in health["engines"].items() if key != "discovery"
        )
        assert health["engines"]["discovery"]["ready"]
        assert health["engines"]["discovery"]["connectivity"] == "checked_on_request"
        assert "Harness interpreter" in health["engines"]["harness"]["reason"]
        assert client.get("/api/assets").status_code == 200
        assert client.get("/api/research/objects").status_code == 200
        deployment = client.get("/api/deployment").json()
        assert deployment["engines"]["diffsbdd"]["name"] == "DiffSBDD"
        assert "discovery" not in deployment["engines"]
        assert deployment["services"]["discovery"]["role"] == "public_data_service"
        assert all("/mnt/c/" not in path for path in deployment["locations"])


def test_diffsbdd_readiness_is_not_derived_from_opendde(client_factory):
    class IndependentEngines(ProcessEngine):
        async def readiness(self):
            opendde = {"ready": False, "reason": "OpenDDE missing", "gpu": None}
            return {
                **opendde,
                "backends": {
                    "opendde": opendde,
                    "diffsbdd": {"ready": True, "reason": None, "models": {"test": True}},
                    "harness": {"ready": False, "compute_configured": False},
                },
            }

    with client_factory(IndependentEngines()) as client:
        health = client.get("/api/health").json()
        assert health["platform"]["ready"]
        assert not health["engine"]["ready"]
        assert not health["engines"]["opendde"]["ready"]
        assert health["engines"]["diffsbdd"]["ready"]
        assert health["engines"]["diffsbdd"]["name"] == "DiffSBDD"
        assert not health["engines"]["harness"]["ready"]


def test_a_registered_engine_without_an_adapter_cannot_fall_through_to_opendde(
    settings, monkeypatch
):
    router = BackendRouter(settings)
    monkeypatch.setattr(
        "opendde_workbench.backend_router.engine_for",
        lambda operation: SimpleNamespace(id="future-engine"),
    )
    job = SimpleNamespace(id="future-job", request=SimpleNamespace(operation="future-operation"))
    monkeypatch.setattr(router.store, "get", lambda identifier: job)

    class UnexpectedDocker:
        async def start(self, *args):
            raise AssertionError("A different engine must never be sent to OpenDDE")

        async def stop(self, *args):
            raise AssertionError("A different engine must never be cancelled through OpenDDE")

    router.opendde = UnexpectedDocker()
    with pytest.raises(ValueError, match="No execution adapter"):
        asyncio.run(router.start(job, settings.state_dir))
    with pytest.raises(ValueError, match="No execution adapter"):
        asyncio.run(router.stop(job.id))


def test_one_engine_diagnostic_failure_does_not_disable_platform_or_other_engines(
    client_factory, settings, monkeypatch, caplog
):
    router = BackendRouter(settings)

    async def failing_check():
        raise RuntimeError("private-config-value-must-not-reach-health")

    monkeypatch.setattr(router.opendde, "readiness", failing_check)
    monkeypatch.setattr(
        "opendde_workbench.backend_router.diff_readiness",
        lambda settings: {"ready": True, "reason": None, "models": {}},
    )
    with client_factory(router) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        health = response.json()
        assert health["platform"]["ready"]
        assert not health["engines"]["opendde"]["ready"]
        assert "runtime check failed" in health["engines"]["opendde"]["reason"]
        assert health["engines"]["diffsbdd"]["ready"]
        assert "private-config-value" not in response.text
        assert "engine=opendde error_type=RuntimeError" in caplog.text
        assert "private-config-value" not in caplog.text
