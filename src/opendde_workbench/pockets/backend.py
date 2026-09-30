"""Offline bounded Java inference in the reviewed image and shared task lifecycle."""

import asyncio
import os
from pathlib import Path

from ..engine import command
from .runtime import configuration, verify_files


class PocketBackend:
    def __init__(self, settings):
        self.settings = settings

    @staticmethod
    def container(job_id):
        return "xdde-p2rank-" + job_id

    async def readiness(self):
        result = {
            "ready": False,
            "reason": None,
            "scientific_acceptance": "pending_server_validation",
        }
        try:
            configuration(self.settings)
            code, _ = await command(
                "docker", "image", "inspect", self.settings.p2rank_image, timeout=8
            )
            if code:
                raise ValueError("Install the P2Rank CPU Java image, then restart X-DDE.")
            result["ready"] = True
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            result["reason"] = str(exc)
        return result

    async def start(self, job, directory):
        root, manifest = configuration(self.settings)
        await asyncio.to_thread(verify_files, root, manifest)
        task = job.request
        asset = list((directory / "assets").glob(str(task.protein.asset_id) + ".*"))
        if len(asset) != 1 or asset[0].suffix not in {".pdb", ".cif"}:
            raise ValueError("Choose an immutable PDB or mmCIF structural input.")
        for file in (root, directory):
            if "," in str(file):
                raise ValueError("Docker mount paths cannot contain commas.")
        cache = directory / "p2rank-cache"
        cache.mkdir(exist_ok=True)
        (directory / "java-native").mkdir(exist_ok=True)
        args = [
            "docker",
            "create",
            "--name",
            self.container(job.id),
            "--network",
            "none",
            "--hostname",
            "xdde-pocket",
            "--add-host",
            "xdde-pocket:127.0.0.1",
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
            str(task.memory_mib) + "m",
            "--cpus",
            str(task.threads),
            "--mount",
            f"type=bind,source={root},target=/p2rank,readonly",
            "--mount",
            f"type=bind,source={directory},target=/job",
            "--mount",
            f"type=bind,source={cache},target=/p2rank/cache",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=512m",
            "--workdir",
            "/job",
            "--env",
            "INSTALL_DIR=/p2rank",
            "--entrypoint",
            "java",
            self.settings.p2rank_image,
            "-Xmx" + str(max(256, task.memory_mib - 256)) + "m",
            "-Duser.home=/job",
            "-Djava.io.tmpdir=/job/java-native",
            "-cp",
            "/p2rank/bin/p2rank.jar:/p2rank/bin/lib/*",
            "cz.siret.prank.program.Main",
            "predict",
            "-f",
            "/job/assets/" + asset[0].name,
            "-o",
            "/job/output/native",
            "-threads",
            str(task.threads),
            "-visualizations",
            "0",
            "-pred_point_threshold",
            str(task.point_threshold),
            "-pred_min_cluster_size",
            str(task.minimum_cluster),
        ]
        if task.profile == "predicted":
            args += ["-c", "alphafold"]
        code, output = await command(*args)
        if code:
            raise RuntimeError("Unable to create the P2Rank task container: " + output)
        # The wrapper waits for native Docker completion and normalizes actual CSV artifacts.
        import json

        from .. import local_process

        (directory / "pocket-execution.json").write_text(
            json.dumps({"container": self.container(job.id)})
        )
        env = {
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(Path(__file__).resolve().parents[2]),
        }
        return await local_process.start(
            Path(__import__("sys").executable),
            Path(__file__).with_name("supervise.py"),
            directory,
            env,
        )

    async def stop(self, job_id, directory):
        from .. import local_process

        code, output = await command("docker", "rm", "--force", self.container(job_id))
        if code and "No such container" not in output:
            raise RuntimeError("P2Rank container cancellation is unconfirmed.")
        await local_process.stop(Path(__file__).with_name("supervise.py"), directory)
