"""Actual bounded Docker execution in CI; no OpenDDE model or owner stress test."""

import asyncio
import json
import shutil
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.chemistry.image import PYTHON_IMAGE
from opendde_workbench.engine import DockerEngine, command
from opendde_workbench.models import Prediction
from opendde_workbench.settings import Settings

PROBE = """from pathlib import Path
import json, time
base = Path("/sys/fs/cgroup")
proof = {name: (base/name).read_text().strip()
         for name in ("memory.max", "memory.swap.max", "cpu.max", "pids.max")}
Path("/job/output/kernel-proof.json").write_text(json.dumps(proof))
if Path(__file__).with_name("mode.txt").read_text() == "oom":
    blocks = []
    while True:
        blocks.append(bytearray(16 * 1024**2))
        time.sleep(.005)
"""


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
@pytest.mark.parametrize("mode", ["normal", "oom"])
async def test_actual_cgroup_limits_and_isolated_oom(tmp_path, mode):
    directory = tmp_path / str(uuid4())
    (directory / "output").mkdir(parents=True)
    runtime = tmp_path / "runtime"
    module = runtime / "external/opendde/runner/batch_inference.py"
    module.parent.mkdir(parents=True)
    module.write_text(PROBE)
    module.with_name("mode.txt").write_text(mode)
    source = runtime / "external/opendde/opendde/data/inference/json_to_feature.py"
    source.parent.mkdir(parents=True)
    source.write_text("# controlled protocol fixture, no scientific inference\n")
    image_file, code_file = tmp_path / "image.txt", tmp_path / "code.txt"
    image_file.write_text(PYTHON_IMAGE)
    code_file.write_text(str(runtime))
    settings = Settings(
        state_dir=tmp_path,
        image_file=image_file,
        code_file=code_file,
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
    )
    settings.model_dir.mkdir()
    settings = replace(settings, opendde_cpus=1, opendde_memory_mib=256, opendde_pids=64)
    backend = DockerEngine(settings)
    value = SimpleNamespace(
        id=directory.name,
        request=Prediction(
            name="controlled resource probe",
            components=[{"kind": "protein", "value": "ACDE"}],
            parameters={"device": "cpu"},
        ),
    )
    process = None
    try:
        process = await backend.start(value, directory)
        output, _ = await asyncio.wait_for(process.communicate(), timeout=45)
        assert process.returncode == (137 if mode == "oom" else 0), output.decode()
        proof = json.loads((directory / "output/kernel-proof.json").read_text())
        assert proof["memory.max"] == str(256 * 1024**2)
        assert proof["memory.swap.max"] == "0"
        quota, period = map(int, proof["cpu.max"].split())
        assert quota == period and period > 0
        assert proof["pids.max"] == "64"
        receipt = json.loads((directory / "resource-limits.json").read_text())
        code, state = await command(
            "docker", "inspect", "--format", "{{json .State.OOMKilled}}", receipt["container_id"]
        )
        assert code == 0 and json.loads(state) is (mode == "oom")
        destination = Path("server_tests/evidence/opendde-limits") / mode
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(directory / "resource-limits.json", destination / "resource-limits.json")
        (destination / "kernel-proof.json").write_text(
            json.dumps(
                {
                    "kernel": proof,
                    "exit_code": process.returncode,
                    "oom_killed": json.loads(state),
                    "scientific_inference": False,
                },
                indent=2,
            )
        )
    finally:
        await backend.stop(value.id)
        if process is not None and process.returncode is None:
            await process.wait()
