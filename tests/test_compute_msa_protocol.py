"""Protocol configuration, owned migration and the actual native factory boundary."""

import json
import subprocess
import sys
from types import ModuleType, SimpleNamespace

import pytest

from opendde_workbench.deployment.compute_config import (
    ComputeConfiguration,
    read_connection,
    state_identity,
)
from opendde_workbench.deployment.compute_service import ComputeService
from opendde_workbench.deployment.msa_config import DEFAULT_MSA_ENDPOINT, msa_endpoint
from opendde_workbench.deployment.native_compute_service import launch_arguments
from opendde_workbench.locations import atomic_json


@pytest.fixture
def configured(tmp_path):
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    python = runtime / "python"
    python.write_text("Native interpreter boundary fixture")
    config = ComputeConfiguration(
        state_id=state_identity(tmp_path),
        container="xdde-harness-msa-test",
        url="http://127.0.0.1:8080",
        token="private-msa-fixture-token",
        shared_dir=str(tmp_path / "shared"),
        remote_dir=str(tmp_path / "shared"),
        image="aurekaresearch/opendde-harness@sha256:" + "a" * 64,
        code=str(runtime / "code"),
        network="bridge",
    )
    atomic_json(tmp_path / "compute-service.json", config.model_dump())
    atomic_json(tmp_path / "deployment.json", {"root": str(runtime)})
    atomic_json(
        runtime / "installed.json",
        {
            "harness": {"python": str(python)},
            "compute": {"image": config.image},
            "runtime": {"code": config.code},
            "abag": {},
        },
    )
    return tmp_path, runtime, config


def native_calls(monkeypatch, *, busy=False):
    calls = []

    def run(arguments, **kwargs):
        message = json.loads(kwargs["input"])
        calls.append(message)
        reply = (
            {"ok": False, "error": "Finish native compute tasks"}
            if busy
            else {
                "ok": True,
                "result": {"running": True, "ready": True},
            }
        )
        return subprocess.CompletedProcess(arguments, 0, json.dumps(reply), "")

    monkeypatch.setattr(subprocess, "run", run)
    return calls


@pytest.mark.parametrize(
    "value",
    [
        "https://user:secret@example.org",
        "https://@example.org",
        "https://example.org?key=secret",
        "https://example.org/#fragment",
        "https://example.org\n",
        "file:///tmp/service",
        "https://example.org:0",
        "https://example.org:99999",
        "",
        False,
    ],
)
def test_msa_endpoint_cannot_smuggle_credentials_or_non_http_configuration(value):
    with pytest.raises(ValueError):
        msa_endpoint(value)


def test_default_and_explicit_self_hosted_protocol():
    assert msa_endpoint() == DEFAULT_MSA_ENDPOINT == "https://api.colabfold.com"
    assert msa_endpoint("http://127.0.0.1:8877/mmseqs/") == "http://127.0.0.1:8877/mmseqs"


def test_status_requires_upgrade_without_changing_a_legacy_connection(configured, monkeypatch):
    state, _, config = configured
    before = (state / "compute-service.json").read_bytes()
    calls = native_calls(monkeypatch)
    status = ComputeService(state).invoke("status")
    assert status["restart_required"] and not status["ready"]
    assert [row["action"] for row in calls] == ["status"]
    assert (state / "compute-service.json").read_bytes() == before
    assert read_connection(state) == config


def test_idle_msa_migration_retires_only_the_owned_connection(configured, monkeypatch):
    state, _, original = configured
    calls = native_calls(monkeypatch)
    endpoint = "https://msa.example.org/colabfold"
    assert ComputeService(state, msa_url=endpoint).invoke("start")["ready"]
    assert [row["action"] for row in calls] == ["retire", "start"]
    assert calls[0]["connection"] == original.model_dump()
    assert calls[1]["connection"]["msa_url"] == endpoint
    current = read_connection(state)
    assert current.msa_url == endpoint
    assert current.image == original.image and current.code == original.code
    assert current.token == original.token and current.shared_dir == original.shared_dir


def test_busy_msa_migration_preserves_the_original_private_file(configured, monkeypatch):
    state, _, _ = configured
    before = (state / "compute-service.json").read_bytes()
    calls = native_calls(monkeypatch, busy=True)
    with pytest.raises(ValueError, match="Finish"):
        ComputeService(state).invoke("start")
    assert [row["action"] for row in calls] == ["retire"]
    assert (state / "compute-service.json").read_bytes() == before


def test_an_already_applied_endpoint_does_not_retire_the_service(configured, monkeypatch):
    state, _, config = configured
    atomic_json(
        state / "compute-service.json",
        config.model_copy(update={"msa_url": DEFAULT_MSA_ENDPOINT}).model_dump(),
    )
    calls = native_calls(monkeypatch)
    service = ComputeService(state)
    assert service.invoke("start")["ready"]
    assert service.invoke("start")["ready"]
    assert [row["action"] for row in calls] == ["start", "start"]


def test_native_factory_receives_the_operator_endpoint(configured, monkeypatch):
    _, runtime, config = configured
    package, cli, factory = (
        ModuleType(name)
        for name in (
            "opendde_harness",
            "opendde_harness.cli",
            "opendde_harness.cli.onboard_compute",
        )
    )
    package.__path__, cli.__path__ = [], []
    package.cli, cli.onboard_compute = cli, factory
    captured = []

    def create(settings, token, api_url, **kwargs):
        captured.append(settings)
        return [
            "run",
            "--detach",
            "--publish",
            "8080:8080",
            "--entrypoint",
            "python",
            "image",
        ], dict(settings.env)

    factory.DockerSettings, factory.create_arguments = SimpleNamespace, create
    for module in (package, cli, factory):
        monkeypatch.setitem(sys.modules, module.__name__, module)
    endpoint = "https://msa.example.org/colabfold"
    arguments, environment = launch_arguments(
        config.model_copy(update={"msa_url": endpoint}).model_dump(), runtime, "opendde_abag.pt"
    )
    assert captured[0].env == {"MMSEQS_SERVICE_HOST_URL": endpoint}
    assert environment["MMSEQS_SERVICE_HOST_URL"] == endpoint
    assert arguments[arguments.index("--env") + 1] == "MMSEQS_SERVICE_HOST_URL"
    assert "--restart" in arguments and "--user" in arguments
