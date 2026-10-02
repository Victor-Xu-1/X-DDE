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
