"""Managed offline container adapter; the existing Router/Worker owns lifecycle."""

import hashlib
import json
import os
import sys
from pathlib import Path

from .. import local_process
from ..engine import command
from .runtime import configuration, readiness

FILES = ("runner.py", "states.py", "mapping.py", "conformers.py", "options.py")


class ChemistryBackend:
    def __init__(self, settings):
        self.settings = settings

    async def readiness(self):
        return await readiness(self.settings)

    @staticmethod
    def container(job_id):
        return "xdde-chemistry-" + job_id

    async def start(self, job, directory):
        image = configuration(self.settings)
        adapter = directory / "adapter"
        adapter.mkdir(exist_ok=False)
        checksums = {}
        for name in FILES:
            file = Path(__file__).with_name(name)
            if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
                raise ValueError("Chemistry adapter source is unsafe or oversized.")
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
        args.extend(["--entrypoint", "python", image, "-B", "/platform/runner.py"])
        code, text = await command(*args)
        if code:
            raise RuntimeError("Unable to create the chemistry task container: " + text)
        (directory / "chemistry-execution.json").write_text(
            json.dumps({"image": image, "adapter_sha256": checksums})
        )
        env = {
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(Path(__file__).parent.parent.parent),
        }
        try:
            return await local_process.start(
                Path(sys.executable), Path(__file__).with_name("supervise.py"), directory, env
            )
        except Exception:
            await command("docker", "rm", "--force", self.container(job.id))
            raise

    async def stop(self, job_id, directory):
        code, text = await command("docker", "rm", "--force", self.container(job_id))
        if code and "No such container" not in text:
            raise RuntimeError("Chemistry container cancellation is unconfirmed.")
        await local_process.stop(Path(__file__).with_name("supervise.py"), directory)
