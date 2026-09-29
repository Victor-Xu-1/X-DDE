"""OpenDDE is executed as an external, digest-pinned Docker dependency."""

import asyncio
import os
import re
from pathlib import Path
from typing import Protocol

from .models import Job
from .settings import Settings


class Engine(Protocol):
    async def start(self, job: Job, directory: Path) -> asyncio.subprocess.Process: ...
    async def stop(self, job_id: str) -> None: ...
    async def readiness(self) -> dict: ...


async def command(*args: str, timeout: int = 20) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout)
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise
    return process.returncode, output.decode(errors="replace")[-4096:]


class DockerEngine:
    def __init__(self, settings: Settings):
        self.settings = settings

    @staticmethod
    def container(job_id: str) -> str:
        return "opendde-wb-" + job_id

    def runtime(self) -> tuple[str, Path]:
        image = self.settings.image_file.read_text().strip()
        code = Path(self.settings.code_file.read_text().strip()).resolve()
        if not re.fullmatch(r"[\w./:-]+@sha256:[0-9a-f]{64}", image):
            raise ValueError("Configure a Docker image pinned by sha256 digest.")
        if not (code / "external/opendde/runner/batch_inference.py").is_file():
            raise ValueError("OpenDDE runtime code is missing.")
        if not (self.settings.model_dir / "checkpoint/opendde.pt").is_file():
            raise ValueError("OpenDDE checkpoint is missing.")
        return image, code

    def arguments(self, job: Job, directory: Path) -> list[str]:
        image, code = self.runtime()
        args = [
            "docker",
            "create",
            "--name",
            self.container(job.id),
            "--network",
            "none",
            "--gpus",
            "all",
            "--shm-size",
            "2g",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
        ]
        for key, value in {
            "OPENDDE_ROOT_DIR": "/opendde",
            "PYTHONPATH": "/runtime/external/opendde",
            "LAYERNORM_TYPE": "torch",
            "OMP_NUM_THREADS": "4",
            "MKL_NUM_THREADS": "4",
            "XDG_CACHE_HOME": "/cache",
            "TRITON_CACHE_DIR": "/cache/triton",
            "CUDA_CACHE_PATH": "/cache/cuda",
            "PYTHONUNBUFFERED": "1",
        }.items():
            args += ["--env", f"{key}={value}"]
        for host, guest, readonly in [
            (code, "/runtime", True),
            (self.settings.model_dir, "/opendde", True),
            (directory, "/job", False),
            (self.settings.cache_dir, "/cache", False),
        ]:
            if "," in str(host):
                raise ValueError("Docker mount paths cannot contain commas.")
            args += [
                "--mount",
                f"type=bind,source={host},target={guest}" + (",readonly" if readonly else ""),
            ]
        p = job.request.parameters
        prediction_args = [
            "--workdir",
            "/job",
            "--entrypoint",
            "python",
            image,
            "-m",
            "runner.batch_inference",
            "pred",
            "-i",
            "input.json",
            "-o",
            "output",
            "--device",
            "cuda",
            "--dtype",
            p.dtype,
            "--sample",
            str(p.samples),
            "--step",
            str(p.steps),
            "--cycle",
            str(p.cycles),
            "--use_msa",
            "false",
            "--use_template",
            "false",
            "--use_rna_msa",
            "false",
        ]
        if p.model == "abag":
            prediction_args += ["--load_checkpoint_path", "/opendde/checkpoint/opendde_abag.pt"]
        return args + prediction_args

    async def start(self, job: Job, directory: Path) -> asyncio.subprocess.Process:
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
        code, output = await command(*self.arguments(job, directory))
        if code:
            raise RuntimeError(f"Docker could not create the task container: {output}")
        return await asyncio.create_subprocess_exec(
            "docker",
            "start",
            "--attach",
            self.container(job.id),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

    async def stop(self, job_id: str) -> None:
        code, output = await command("docker", "rm", "--force", self.container(job_id))
        if code and "No such container" not in output:
            raise RuntimeError("Docker could not remove the task container.")

    async def readiness(self) -> dict:
        try:
            image, _ = self.runtime()
            code, _ = await command("docker", "image", "inspect", image, timeout=8)
            if code:
                raise ValueError("Configured Docker image is unavailable.")
            code, output = await command(
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.free",
                "--format=csv,noheader,nounits",
                timeout=5,
            )
            if code:
                raise ValueError("NVIDIA GPU is unavailable.")
            return {
                "ready": True,
                "gpu": output.strip(),
                "reason": None,
                "models": {
                    "standard": True,
                    "abag": (self.settings.model_dir / "checkpoint/opendde_abag.pt").is_file(),
                },
            }
        except (OSError, ValueError, RuntimeError, TimeoutError) as error:
            return {"ready": False, "gpu": None, "reason": str(error)}
