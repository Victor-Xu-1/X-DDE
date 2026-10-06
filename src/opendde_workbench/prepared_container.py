"""Shared bounded preparation-container lifecycle beneath the sole Router/Worker."""

import hashlib
import json
import os
import sys
from pathlib import Path

from . import local_process
from .engine import command
from .managed_containers import CONTAINER_STYLES, container_name


class PreparedContainerBackend:
    def __init__(
        self, settings, identifier, root, files, configuration, readiness, *, shared_sources=None
    ):
        if CONTAINER_STYLES.get(identifier) != "preparation":
            raise ValueError("Unknown managed preparation container namespace.")
        shared_sources = shared_sources or {}
        if set(files) & set(shared_sources):
            raise ValueError("Shared adapter file identities must be unique.")
        files = (*files, *shared_sources)
        self.shared_sources = {name: Path(path) for name, path in shared_sources.items()}
        if not 1 <= len(files) <= 32 or any(Path(name).name != name for name in files):
            raise ValueError("Preparation adapter files must have bounded, explicit names.")
        self.settings, self.identifier, self.root, self.files = settings, identifier, root, files
        self.configuration, self.runtime_readiness = configuration, readiness

    async def readiness(self):
        return await self.runtime_readiness(self.settings)

    def container(self, job_id):
        return container_name(self.identifier, job_id, preparation=True)

    def execution_arguments(self, job, directory):
        """Reviewed native adapters may add bounded model mounts or GPU access."""
        return []

    def image_for(self, job, directory):
        return self.configuration(self.settings)

    async def prepare_execution_arguments(self, job, directory):
        return self.execution_arguments(job, directory)

    async def start(self, job, directory):
        image = self.image_for(job, directory)
        adapter = directory / "adapter"
        adapter.mkdir(exist_ok=False)
        checksums = {}
        for name in self.files:
            file = self.shared_sources.get(name, self.root / name)
            if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
                raise ValueError("Preparation adapter source is unsafe or oversized.")
            content = file.read_bytes()
            (adapter / name).write_bytes(content)
            (adapter / name).chmod(0o444)
            checksums[name] = hashlib.sha256(content).hexdigest()
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
            "64",
            "--memory",
            str(options.memory_mib) + "m",
            "--cpus",
            str(options.cpu),
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=256m",
            "--env",
            "HOME=/tmp",
            "--env",
            "OMP_NUM_THREADS=" + str(options.cpu),
        ]
        for host, target, readonly in [
            (adapter, "/platform", True),
            (directory / "assets", "/input/assets", True),
            (directory / "request.json", "/input/request.json", True),
            (directory / "bindings.json", "/input/bindings.json", True),
            (directory / "output", "/output", False),
        ]:
            if host.is_symlink() or "," in str(host):
                raise ValueError("Scientific mount paths must be real paths without commas.")
            args.extend(
                [
                    "--mount",
                    f"type=bind,source={host},target={target}" + (",readonly" if readonly else ""),
                ]
            )
        args.extend(await self.prepare_execution_arguments(job, directory))
        args.extend(["--entrypoint", "python", image, "-B", "/platform/runner.py"])
        code, text = await command(*args)
        if code:
            raise RuntimeError("Unable to create the preparation task container: " + text)
        env = {
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(Path(__file__).parent.parent),
        }
        try:
            (directory / (self.identifier + "-execution.json")).write_text(
                json.dumps({"image": image, "adapter_sha256": checksums}), encoding="utf-8"
            )
            return await local_process.start(
                Path(sys.executable), self.root / "supervise.py", directory, env
            )
        except Exception as error:
            cleanup_code, cleanup_text = await command(
                "docker", "rm", "--force", self.container(job.id)
            )
            if cleanup_code and "No such container" not in cleanup_text:
                raise RuntimeError(
                    "Preparation startup failed and owned container cleanup is unconfirmed."
                ) from error
            raise

    async def stop(self, job_id, directory):
        code, text = await command("docker", "rm", "--force", self.container(job_id))
        if code and "No such container" not in text:
            raise RuntimeError("Preparation container cancellation is unconfirmed.")
        await local_process.stop(self.root / "supervise.py", directory)
