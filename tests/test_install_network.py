import pytest

from opendde_workbench.deployment.network import build_command


def test_proxy_build_uses_names_and_explicit_host_network():
    secret_proxy = "http://user:secret@127.0.0.1:7890"
    command = build_command(
        ["docker", "build", "--pull", "--tag", "reviewed", "/context"],
        {"WB_INSTALL_BUILD_NETWORK": "host", "HTTPS_PROXY": secret_proxy},
    )
    assert command == [
        "docker",
        "build",
        "--network",
        "host",
        "--build-arg",
        "HTTPS_PROXY",
        "--pull",
        "--tag",
        "reviewed",
        "/context",
    ]
    assert all("secret" not in argument for argument in command)


def test_scientific_execution_and_explicit_network_are_preserved():
    env = {"WB_INSTALL_BUILD_NETWORK": "host", "HTTPS_PROXY": "http://proxy:7890"}
    offline = ["docker", "run", "--network", "none", "sha256:reviewed"]
    assert build_command(offline, env) == offline
    explicit = ["docker", "build", "--network=none", "/context"]
    assert build_command(explicit, env) == [
        "docker",
        "build",
        "--build-arg",
        "HTTPS_PROXY",
        "--network=none",
        "/context",
    ]


def test_default_build_retains_default_network_and_rejects_unknown_network():
    command = ["docker", "build", "/context"]
    assert build_command(command, {}) == command
    with pytest.raises(ValueError, match="default or host"):
        build_command(command, {"WB_INSTALL_BUILD_NETWORK": "unreviewed"})


@pytest.mark.parametrize("mirror", ["official", "tuna"])
def test_selected_pypi_origin_is_bound_to_the_same_native_docker_build(mirror):
    command = build_command(
        ["docker", "--host", "unix:///run/owned.sock", "build", "--network=none", "/context"],
        {"WB_INSTALL_PYPI_MIRROR": mirror, "WB_INSTALL_BUILD_NETWORK": "host"},
    )
    origin = (
        "https://pypi.org/simple"
        if mirror == "official"
        else "https://pypi.tuna.tsinghua.edu.cn/simple"
    )
    assert command == [
        "docker",
        "--host",
        "unix:///run/owned.sock",
        "build",
        "--build-arg",
        "XDDE_PYPI_INDEX=" + origin,
        "--network=none",
        "/context",
    ]
    # Installation transport never changes a task's frozen runtime or offline network.
    task = ["docker", "run", "--network", "none", "sha256:reviewed"]
    assert build_command(task, {"WB_INSTALL_PYPI_MIRROR": mirror}) == task


@pytest.mark.parametrize("mirror", ["", "https://unknown.example/simple", "tuna\n--network=host"])
def test_unreviewed_pypi_selector_is_rejected_before_starting_docker(mirror):
    with pytest.raises(ValueError, match="official or tuna"):
        build_command(["docker", "build", "/context"], {"WB_INSTALL_PYPI_MIRROR": mirror})
