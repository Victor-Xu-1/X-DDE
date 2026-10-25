"""Actual native service factory/repair cgroups in CI; no model or GPU execution."""

import json
import subprocess
import sys
import textwrap
from pathlib import Path
from types import ModuleType, SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.chemistry.image import PYTHON_IMAGE
from opendde_workbench.deployment import native_compute_limits as resources
from opendde_workbench.deployment import native_compute_probe as probe
from opendde_workbench.deployment import native_compute_service as native
from opendde_workbench.opendde_limits import OpenDDELimits

POLICY = {"cpus": 1, "memory_mib": 256, "pids": 64}
HEALTH = {
    "workers": {
        "queue": {"running": 0, "queued": 0},
        "backend": dict.fromkeys(
            ("code_ready", "root_ready", "common_ready", "checkpoint_ready"), True
        ),
    }
}
KERNEL = """from pathlib import Path
import json
p=Path('/sys/fs/cgroup')
print(json.dumps({k:(p/k).read_text().strip() for k in
 ('memory.max','memory.swap.max','cpu.max','pids.max')}))
"""


def docker(*args, **kwargs):
    return subprocess.run(
        ["docker", *args], check=True, capture_output=True, text=True, timeout=30, **kwargs
    ).stdout.strip()


def inspect(identifier):
    return json.loads(docker("container", "inspect", identifier))[0]


def test_owned_loader_probe_real_lifecycle_without_automatic_removal(monkeypatch, tmp_path):
    """Real Docker/cgroups with a controlled loader response; no CUDA claim in CI."""
    original = subprocess.run
    observed = []

    def cpu_protocol(arguments, **kwargs):
        arguments = list(arguments)
        if arguments[:2] == ["docker", "run"]:
            assert "--rm" not in arguments
            index = arguments.index("--gpus")
            assert arguments[index + 1] == "all"
            del arguments[index : index + 2]
            # The CI runner has no GPU. Only its device response is controlled;
            # launch, ownership, kernel limits and exact-ID cleanup remain real.
            arguments[-1] = (
                "import contextlib,sys\nwith contextlib.redirect_stdout(sys.stderr):\n"
                + textwrap.indent(KERNEL, "    ")
                + "\nprint(json.dumps(['/usr/lib/wsl/drivers/ci_protocol/libcuda_loader.so']))"
            )
            value = original(arguments, **kwargs)
            observed.append(json.loads(value.stderr.strip()))
            return value
        return original(arguments, **kwargs)

    monkeypatch.setattr(probe.subprocess, "run", cpu_protocol)
    connection = {"state_id": "ci-owned-probe", "image": PYTHON_IMAGE}
    assert probe.load_cuda(connection, OpenDDELimits(**POLICY), tmp_path).endswith(
        "libcuda_loader.so"
    )
    assert observed == [
        {
            "memory.max": str(256 * 1024**2),
            "memory.swap.max": "0",
            "cpu.max": "100000 100000",
            "pids.max": "64",
        }
    ]
    receipt = json.loads(next((tmp_path / "native-probes").glob("*.json")).read_text())
    assert receipt["phase"] == "removed" and receipt["returncode"] == 0
    destination = Path("server_tests/evidence/managed-compute-limits")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "owned-loader-probe.json").write_text(
        json.dumps(
            {"kernel": observed[0], "receipt": receipt, "cuda_or_model_execution": False}, indent=2
        )
    )


@pytest.fixture
def boundary(monkeypatch, tmp_path):
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
    factory.DockerSettings = SimpleNamespace
    factory.create_arguments = lambda settings, token, api_url, **kwargs: (
        [
            "run",
            "--detach",
            "--name",
            kwargs["name"],
            "--entrypoint",
            "python",
            PYTHON_IMAGE,
            "-c",
            "import time; time.sleep(240)",
        ],
        {},
    )
    factory.inspect_container, factory.docker = inspect, docker
    factory.wait_for_service = lambda *args, **kwargs: None
    for module in (package, cli, factory):
        monkeypatch.setitem(sys.modules, module.__name__, module)
    monkeypatch.setattr(native, "health", lambda connection: HEALTH)
    return {
        "container": "xdde-harness-ci-" + uuid4().hex[:12],
        "state_id": "ci-resource-scope",
        "image": PYTHON_IMAGE,
        "shared_dir": str(tmp_path / "shared"),
        "network": "bridge",
        "code": str(tmp_path),
        "url": "http://127.0.0.1:8080",
        "token": "fixture-token-only",
        "msa_url": "https://api.colabfold.com",
    }


@pytest.mark.parametrize("mode", ["new_factory", "legacy_repair"])
def test_real_created_and_repaired_service_has_kernel_limits(boundary, tmp_path, mode):
    identifier = None
    try:
        if mode == "new_factory":
            arguments, environment = native.launch_arguments(
                boundary, tmp_path, "fixture-no-model.pt", POLICY
            )
            assert not environment  # The controlled factory needs no credentials or service.
            identifier = docker(*arguments)
        else:
            identifier = docker(
                "run",
                "--detach",
                "--name",
                boundary["container"],
                "--label",
                "org.xdde.owner=X-DDE",
                "--label",
                "org.xdde.state=" + boundary["state_id"],
                "--entrypoint",
                "python",
                PYTHON_IMAGE,
                "-c",
                "import time; time.sleep(240)",
            )
            before = inspect(identifier)
            assert before["HostConfig"]["Memory"] == 0
            boundary["container_id"] = identifier
            status = native.execute(
                {"action": "status", "connection": boundary, "resource_limits": POLICY}
            )
            assert not status["resource_limits_verified"] and not status["ready"]
            repaired = native.execute(
                {"action": "start", "connection": boundary, "resource_limits": POLICY}
            )
            assert repaired["ready"] and repaired["container_id"] == identifier
            assert inspect(identifier)["State"]["StartedAt"] == before["State"]["StartedAt"]
        current = inspect(identifier)
        assert resources.verified(current, resources.policy(POLICY))
        kernel = json.loads(docker("exec", identifier, "python", "-c", KERNEL))
        assert kernel["memory.max"] == str(256 * 1024**2)
        assert kernel["memory.swap.max"] == "0"
        quota, period = map(int, kernel["cpu.max"].split())
        assert quota == period and period > 0
        assert kernel["pids.max"] == "64"
        evidence = Path("server_tests/evidence/managed-compute-limits")
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / f"{mode}.json").write_text(
            json.dumps(
                {
                    "container_id": identifier,
                    "policy": POLICY,
                    "kernel": kernel,
                    "running": current["State"]["Running"],
                    "scientific_inference": False,
                    "upstream_service_protocol": (
                        "Controlled protocol fixture; real Docker lifecycle and kernel limits"
                    ),
                },
                indent=2,
            )
        )
    finally:
        if identifier:
            docker("rm", "--force", identifier)
