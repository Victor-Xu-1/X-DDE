"""GNINA is an isolated adapter below the sole BackendRouter execution authority."""

import hashlib
import json
import os
import sys
from pathlib import Path

from .. import local_process
from ..engine import command
from .manifest import VERSION
from .runtime import configuration, labels_match


class DockingBackend:
    def __init__(self, settings):
        self.settings = settings

    @staticmethod
    def container(identifier):
        return "xdde-gnina-" + identifier

    async def readiness(self):
        result = {
            "ready": False,
            "reason": None,
            "version": VERSION,
            "gpu_runtime": False,
            "scientific_acceptance": "pending_server_validation",
        }
        try:
            image = configuration(self.settings)
            code, text = await command(
                "docker",
                "image",
                "inspect",
                "--format",
                "{{json .Config.Labels}}",
                image,
                timeout=8,
            )
            if code or not labels_match(json.loads(text) or {}):
                raise ValueError(
                    "GNINA image is missing or differs from the reviewed runtime contract."
                )
            code, text = await command(
                "docker", "info", "--format", "{{json .Runtimes}}", timeout=8
            )
            if code:
                raise ValueError("The Docker daemon is unavailable.")
            result.update(ready=True, gpu_runtime="nvidia" in json.loads(text))
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            result["reason"] = str(exc)
        return result

    async def start(self, job, directory):
        image = configuration(self.settings)
        source = Path(__file__).parent
        refs = source.parent / "scientific_objects.py"
        output = directory / "output"
        output.mkdir(exist_ok=True)
        paths = [source, refs, directory, directory / "assets", output]
        if any("," in str(path) or path.is_symlink() for path in paths):
            raise ValueError("Native mount paths must be real paths without commas.")
        options = job.request.options
        args = [
            "docker",
            "create",
            "--name",
            self.container(job.id),
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
            "128",
            "--memory",
            str(options.memory_mib) + "m",
            "--cpus",
            str(options.cpu),
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=512m",
            "--env",
            "HOME=/tmp",
            "--env",
            "OMP_NUM_THREADS=" + str(options.cpu),
            "--workdir",
            "/output",
        ]
        for host, target in [
            (source.parent, "/platform"),
            (directory / "assets", "/input/assets"),
            (directory / "request.json", "/input/request.json"),
            (directory / "bindings.json", "/input/bindings.json"),
        ]:
            args.extend(["--mount", f"type=bind,source={host},target={target},readonly"])
        args.extend(["--mount", f"type=bind,source={output},target=/output"])
        if options.use_gpu:
            args.extend(["--gpus", "device=" + str(options.gpu_device)])
        args.extend(["--entrypoint", "python", image, "-B", "/platform/docking/native.py"])
        code, text = await command(*args)
        if code:
            raise RuntimeError("Unable to create the GNINA task container: " + text)
        adapter_files = {
            file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in source.glob("*.py")
        }
        adapter_files["scientific_objects.py"] = hashlib.sha256(refs.read_bytes()).hexdigest()
        (directory / "docking-execution.json").write_text(
            json.dumps({"image": image, "adapter_files": adapter_files})
        )
        env = {
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(source.parent.parent),
        }
        try:
            return await local_process.start(
                Path(sys.executable), source / "supervise.py", directory, env
            )
        except Exception:
            await command("docker", "rm", "--force", self.container(job.id))
            raise

    async def stop(self, job_id, directory):
        code, text = await command("docker", "rm", "--force", self.container(job_id))
        if code and "No such container" not in text:
            raise RuntimeError("GNINA container cancellation is unconfirmed.")
        await local_process.stop(Path(__file__).with_name("supervise.py"), directory)
