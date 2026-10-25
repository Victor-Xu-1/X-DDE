"""Instance ownership, connection secrecy and lifecycle guards without a shared daemon."""

import pytest

from opendde_workbench.deployment.compute_config import (
    ComputeConfiguration,
    read_connection,
    state_identity,
)
from opendde_workbench.deployment.native_compute_service import confirm_service, idle, owned
from opendde_workbench.locations import atomic_json


def connection(tmp_path):
    return ComputeConfiguration(
        state_id=state_identity(tmp_path),
        container="xdde-harness-test",
        url="http://127.0.0.1:8080",
        token="private-test-token-never-public",
        shared_dir=str(tmp_path / "shared"),
        remote_dir=str(tmp_path / "shared"),
        image="aurekaresearch/opendde-harness@sha256:" + "a" * 64,
        code=str(tmp_path / "code"),
        network="bridge",
    )


def test_private_connection_does_not_repr_token(tmp_path):
    config = connection(tmp_path)
    atomic_json(tmp_path / "compute-service.json", config.model_dump())
    assert read_connection(tmp_path) == config
    assert config.token not in repr(config)
    (tmp_path / "compute-service.json").chmod(0o644)
    with pytest.raises(ValueError, match="private"):
        read_connection(tmp_path)


@pytest.mark.parametrize(
    "url", ["http://example.com:8080", "http://user@127.0.0.1:8080", "http://127.0.0.1:8080/path"]
)
def test_managed_service_cannot_target_remote_or_credential_urls(tmp_path, url):
    with pytest.raises(ValueError, match="loopback"):
        ComputeConfiguration.model_validate({**connection(tmp_path).model_dump(), "url": url})


def test_adopted_identity_cannot_stop_another_container(tmp_path):
    config = connection(tmp_path).model_dump()
    config["container_id"] = "expected-instance"
    other = {
        "Id": "other-instance",
        "Config": {"Image": config["image"], "Labels": {"org.xdde.owner": "X-DDE"}},
    }
    with pytest.raises(ValueError, match="owned"):
        owned(other, config)


def test_new_instance_needs_exact_state_label(tmp_path):
    config = connection(tmp_path).model_dump()
    container = {
        "Id": "instance",
        "Config": {
            "Image": config["image"],
            "Labels": {"org.xdde.owner": "X-DDE", "org.xdde.state": config["state_id"]},
        },
    }
    owned(container, config)
    container["Config"]["Labels"]["org.xdde.state"] = "unrelated"
    with pytest.raises(ValueError, match="owned"):
        owned(container, config)


@pytest.mark.parametrize(
    "queue", [None, {"running": ["task"], "queued": []}, {"running": [], "queued": ["task"]}]
)
def test_busy_or_unknown_native_queue_cannot_be_stopped(queue):
    with pytest.raises(ValueError, match="Finish"):
        idle({"workers": {"queue": queue}})


def test_idle_native_count_response_is_allowed():
    idle({"workers": {"queue": {"running": 0, "queued": 0}}})


def test_service_update_retires_only_its_exact_owned_instance(tmp_path, monkeypatch):
    import json
    import subprocess

    from opendde_workbench.deployment.compute_service import ComputeService

    config = connection(tmp_path)
    atomic_json(tmp_path / "compute-service.json", config.model_dump())
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    interpreter = runtime / "python"
    interpreter.write_text("Protocol interpreter fixture")
    atomic_json(tmp_path / "deployment.json", {"root": str(runtime)})
    new_image = "aurekaresearch/opendde-harness@sha256:" + "b" * 64
    atomic_json(
        runtime / "installed.json",
        {
            "harness": {"python": str(interpreter)},
            "compute": {"image": new_image},
            "runtime": {"code": str(runtime / "new-code")},
            "abag": {},
        },
    )
    calls = []

    def native(args, **kwargs):
        message = json.loads(kwargs["input"])
        calls.append((message["action"], message["connection"]["image"]))
        return subprocess.CompletedProcess(
            args,
            0,
            json.dumps(
                {
                    "ok": True,
                    "result": {
                        "running": message["action"] == "start",
                        "ready": message["action"] == "start",
                    },
                }
            ),
            "",
        )

    monkeypatch.setattr(subprocess, "run", native)
    assert ComputeService(tmp_path).invoke("start")["ready"]
    assert calls == [("retire", config.image), ("start", new_image)]
    assert read_connection(tmp_path).image == new_image


def test_busy_retirement_cannot_update_private_configuration(tmp_path, monkeypatch):
    import json
    import subprocess

    from opendde_workbench.deployment.compute_service import ComputeService

    config = connection(tmp_path)
    atomic_json(tmp_path / "compute-service.json", config.model_dump())
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    interpreter = runtime / "python"
    interpreter.write_text("Protocol interpreter fixture")
    atomic_json(tmp_path / "deployment.json", {"root": str(runtime)})
    atomic_json(
        runtime / "installed.json",
        {
            "harness": {"python": str(interpreter)},
            "compute": {"image": "aurekaresearch/opendde-harness@sha256:" + "b" * 64},
            "runtime": {"code": str(runtime / "new-code")},
        },
    )
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda args, **kwargs: subprocess.CompletedProcess(
            args, 0, json.dumps({"ok": False, "error": "Finish native compute tasks"}), ""
        ),
    )
    with pytest.raises(ValueError, match="Finish"):
        ComputeService(tmp_path).invoke("start")
    assert read_connection(tmp_path) == config


@pytest.mark.parametrize("action", ["start", "stop"])
def test_controller_timeout_returns_safe_actionable_error_without_changing_connection(
    tmp_path, monkeypatch, action
):
    import subprocess

    from opendde_workbench.deployment.compute_service import ComputeService
    from opendde_workbench.deployment.msa_config import DEFAULT_MSA_ENDPOINT

    config = connection(tmp_path).model_copy(update={"msa_url": DEFAULT_MSA_ENDPOINT})
    atomic_json(tmp_path / "compute-service.json", config.model_dump())
    root = tmp_path / "runtime"
    root.mkdir()
    interpreter = root / "python"
    interpreter.write_text("Protocol interpreter fixture")
    atomic_json(tmp_path / "deployment.json", {"root": str(root)})
    atomic_json(
        root / "installed.json",
        {
            "harness": {"python": str(interpreter)},
            "compute": {"image": config.image},
            "runtime": {"code": config.code},
        },
    )

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(["docker", config.token, "private-filesystem-path"], 25)

    monkeypatch.setattr(subprocess, "run", timeout)
    with pytest.raises(ValueError, match="Check the current service status") as caught:
        ComputeService(tmp_path).invoke(action)
    assert config.token not in str(caught.value) and "private-filesystem-path" not in str(
        caught.value
    )
    assert read_connection(tmp_path) == config


@pytest.mark.parametrize("kind", [RuntimeError, ValueError, TimeoutError])
def test_upstream_wrapped_probe_error_retains_only_private_cause(tmp_path, kind):
    config = connection(tmp_path).model_dump()
    upstream = kind(
        "Command ['/private/runtime/python', '/private/worker.py', '--probe-import'] "
        + config["token"]
        + " timed out after 30 seconds. Run doctor."
    )

    def wait(url, token, backend, *, timeout):
        assert (url, token, backend, timeout) == (config["url"], config["token"], "local", 65)
        raise upstream

    with pytest.raises(ValueError, match="Check the current service status") as caught:
        confirm_service(config, wait)
    assert caught.value.__cause__ is upstream
    assert all(
        value not in str(caught.value)
        for value in ("/private", config["token"], "Command", "doctor", "--probe-import")
    )


def test_confirmed_probe_keeps_existing_native_success_contract(tmp_path):
    calls = []
    config = connection(tmp_path).model_dump()
    confirm_service(config, lambda *args, **kwargs: calls.append((args, kwargs)))
    assert calls == [((config["url"], config["token"], "local"), {"timeout": 65})]
