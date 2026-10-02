"""Digest-pinned Docker adapter shared by every OpenDDE operation."""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Protocol

from .models import Job
from .native_arguments import native_arguments, needs_gpu, network_enabled
from .settings import Settings


class Engine(Protocol):
    async def start(self, job: Job, directory: Path) -> asyncio.subprocess.Process: ...
    async def stop(self, job_id: str) -> None: ...
    async def readiness(self) -> dict: ...


async def command(*args: str, timeout: int = 20, separate_stderr: bool = False) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE if separate_stderr else asyncio.subprocess.STDOUT,
    )
    try:
        output, diagnostics = await asyncio.wait_for(process.communicate(), timeout)
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise
    if diagnostics:
        if process.returncode:
            output += diagnostics
        else:
            # Docker may emit warnings on stderr during a valid structured metadata response.
            # Keep the protocol stream intact and log the warning without configuration contents.
            logging.getLogger(__name__).warning(
                "command_diagnostic_warning program=%s bytes=%d", args[0], len(diagnostics)
            )
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
        return image, code

    def arguments(self, job: Job, directory: Path, runtime=None) -> list[str]:
        image, code = runtime or self.runtime()
        resource = job.request.operation == "resources"
        args = [
            "docker",
            "create",
            "--name",
            self.container(job.id),
            "--network",
            self.settings.engine_network if network_enabled(job.request) else "none",
            "--shm-size",
            "2g",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
            "--security-opt",
            "no-new-privileges",
            "--cap-drop",
            "ALL",
            "--pids-limit",
            "1024",
        ]
        if needs_gpu(job.request):
            ids = job.request.parameters.gpu_ids
            args += ["--gpus", '"device=' + ",".join(map(str, ids)) + '"' if ids else "all"]
        env = {
            "OPENDDE_ROOT_DIR": "/opendde",
            "PYTHONPATH": "/runtime/external/opendde",
            "LAYERNORM_TYPE": "torch",
            "OMP_NUM_THREADS": "4",
            "MKL_NUM_THREADS": "4",
            "XDG_CACHE_HOME": "/cache",
            "TRITON_CACHE_DIR": "/cache/triton",
            "CUDA_CACHE_PATH": "/cache/cuda",
            "PYTHONUNBUFFERED": "1",
        }
        if self.settings.msa_url:
            env["MMSEQS_SERVICE_HOST_URL"] = self.settings.msa_url
        if self.settings.native_tools_dir:
            env["PATH"] = "/native-tools/bin:/opt/runtime/bin:/usr/local/bin:/usr/bin:/bin"
        if network_enabled(job.request):
            for key in (
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "NO_PROXY",
                "http_proxy",
                "https_proxy",
                "no_proxy",
            ):
                if os.environ.get(key):
                    args += ["--env", key]
        for key, value in env.items():
            args += ["--env", f"{key}={value}"]
        for host, guest, readonly in [
            (code, "/runtime", True),
            (self.settings.model_dir, "/opendde", not resource),
            (directory, "/job", False),
            (self.settings.cache_dir, "/cache", False),
            (Path(__file__).parent, "/adapter", True),
        ]:
            if "," in str(host):
                raise ValueError("Docker mount paths cannot contain commas.")
            args += [
                "--mount",
                f"type=bind,source={host},target={guest}" + (",readonly" if readonly else ""),
            ]
        checkpoint = None
        if self.settings.native_tools_dir:
            tools = self.settings.native_tools_dir
            if not (tools / "bin/zstd").is_file() or tools.is_symlink() or "," in str(tools):
                raise ValueError("Managed native compression tools are unavailable.")
            args += ["--mount", f"type=bind,source={tools},target=/native-tools,readonly"]
        if job.request.operation == "predict" and job.request.parameters.checkpoint_id:
            from .checkpoints import resolve

            checkpoint = resolve(self.settings, job.request.parameters.checkpoint_id)
        invocation = native_arguments(job.request, checkpoint)
        return args + ["--workdir", "/job", "--entrypoint", invocation[0], image, *invocation[1:]]

    async def start(self, job: Job, directory: Path) -> asyncio.subprocess.Process:
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
        if job.request.operation == "resources":
            self.settings.model_dir.mkdir(parents=True, exist_ok=True)
        from .provenance import write_provenance

        runtime = self.runtime()
        args = self.arguments(job, directory, runtime)
        entry = args.index("--entrypoint")
        write_provenance(directory, runtime[0], runtime[1], [args[entry + 1], *args[entry + 3 :]])
        code, output = await command(*args)
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
        from .resources import resource_inventory

        result = {
            "ready": False,
            "gpu": None,
            "gpu_count": 0,
            "reason": None,
            "models": {
                name: (self.settings.model_dir / "checkpoint" / filename).is_file()
                for name, filename in {"standard": "opendde.pt", "abag": "opendde_abag.pt"}.items()
            },
            "resources": resource_inventory(self.settings.model_dir),
        }
        try:
            image, _ = self.runtime()
            code, _ = await command("docker", "image", "inspect", image, timeout=8)
            if code:
                raise ValueError("Configured Docker image is unavailable.")
            result["ready"] = True
            try:
                code, output = await command(
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,memory.free",
                    "--format=csv,noheader,nounits",
                    timeout=5,
                )
                if code == 0:
                    result.update(gpu=output.strip(), gpu_count=len(output.strip().splitlines()))
                else:
                    result["gpu_reason"] = (
                        "NVIDIA GPU is unavailable; CPU execution remains available."
                    )
            except (OSError, TimeoutError):
                result["gpu_reason"] = (
                    "NVIDIA GPU could not be queried; choose CPU or configure the GPU."
                )
        except (OSError, ValueError, RuntimeError, TimeoutError) as error:
            result["reason"] = str(error)
        return result
