"""Hosted-only lifecycle qualification on the existing immutable official Python base."""

import json
import os
import subprocess

import pytest

from opendde_workbench.container_runtime import DockerRuntime, freeze
from opendde_workbench.deployment.native_probe import run_probe
from opendde_workbench.deployment.process import run
from opendde_workbench.integrations.specs import PROGRAMS

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_INSTALL_PROBE") != "1",
    reason="explicit hosted installation lifecycle check only; no owner test suites",
)


@pytest.fixture(scope="module")
def official_image():
    source = PROGRAMS["reinvent"]["base"]
    subprocess.run(["docker", "pull", source], check=True, timeout=240)
    return subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", source],
        text=True,
        timeout=15,
    ).strip()


@pytest.mark.parametrize("bound", [False, True])
@pytest.mark.parametrize("exit_code", [0, 7])
def test_actual_attached_exit_and_owned_cleanup_without_auto_removal(
    tmp_path,
    official_image,
    exit_code,
    bound,
):
    runtime = DockerRuntime()
    if bound:
        observed = subprocess.check_output(
            ["docker", "info", "--format", "{{json .ID}}"], text=True, timeout=10
        )
        runtime = DockerRuntime("unix:///var/run/docker.sock", json.loads(observed))
    freeze(tmp_path, runtime)

    def execute(args, timeout):
        runtime.require()
        return run(
            runtime.arguments(args),
            tmp_path / "process",
            lambda: None,
            lambda _: None,
            timeout=timeout,
        )

    arguments = [
        "--network",
        "none",
        "--read-only",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "32",
        "--memory",
        "128m",
        "--cpus",
        "1",
        "--entrypoint",
        "python",
        official_image,
        "-B",
        "-c",
        f"print('native probe reached', flush=True); raise SystemExit({exit_code})",
    ]
    if exit_code:
        with pytest.raises(RuntimeError, match="exited with code 7"):
            run_probe("reinvent", official_image, arguments, execute, tmp_path)
    else:
        run_probe("reinvent", official_image, arguments, execute, tmp_path)
        assert (tmp_path / "native-cli.log").read_text() == "native probe reached\n"
    receipt = json.loads((tmp_path / "native-probe.json").read_text())
    assert receipt["state"] == ("failed" if exit_code else "succeeded")
    assert receipt["cleanup_confirmed"]
    assert receipt["container_runtime"] == runtime.value
    assert receipt["cleanup_observed_state"]["ExitCode"] == exit_code
    assert json.loads((tmp_path / "native-cleanup.json").read_text())["state"] == "removed"
    inspection = subprocess.run(
        ["docker", "inspect", receipt["container_id"]],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert inspection.returncode == 1 and "No such object" in inspection.stderr
