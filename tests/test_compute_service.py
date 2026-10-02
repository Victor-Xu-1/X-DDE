"""Instance ownership, connection secrecy and lifecycle guards without a shared daemon."""

import pytest

from opendde_workbench.deployment.compute_config import (
    ComputeConfiguration,
    read_connection,
    state_identity,
)
from opendde_workbench.deployment.native_compute_service import idle, owned
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
