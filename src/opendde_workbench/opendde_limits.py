"""Bounded OpenDDE containers; metadata checks precede any native entry point."""

import json

from pydantic import BaseModel, ConfigDict, Field

SUPPORT_FORMAT = (
    '{"memory":{{json .MemoryLimit}},"swap":{{json .SwapLimit}},'
    '"cpu_quota":{{json .CPUCfsQuota}},"cpu_period":{{json .CPUCfsPeriod}},'
    '"pids":{{json .PidsLimit}}}'
)
CONTAINER_FORMAT = (
    '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},'
    '"job":{{json (index .Config.Labels "org.xdde.job")}},'
    '"memory":{{json .HostConfig.Memory}},"memory_swap":{{json .HostConfig.MemorySwap}},'
    '"nano_cpus":{{json .HostConfig.NanoCpus}},"pids_limit":{{json .HostConfig.PidsLimit}},'
    '"oom_kill_disable":{{json .HostConfig.OomKillDisable}}}'
)


class OpenDDELimits(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    cpus: int = Field(default=2, ge=1, le=256)
    memory_mib: int = Field(default=4096, ge=256, le=1048576)
    pids: int = Field(default=256, ge=32, le=4096)

    @classmethod
    def configured(cls, settings):
        return cls(
            cpus=settings.opendde_cpus,
            memory_mib=settings.opendde_memory_mib,
            pids=settings.opendde_pids,
        )

    def arguments(self):
        memory = str(self.memory_mib * 1024**2)
        # Equal physical and total-memory limits disable swap; zero would not.
        return [
            "--memory",
            memory,
            "--memory-swap",
            memory,
            "--cpus",
            str(self.cpus),
            "--pids-limit",
            str(self.pids),
        ]

    def verify(self, value, *, container_id, name, image, job_id):
        if not isinstance(value, dict) or any(
            value.get(key) != expected
            for key, expected in {
                "id": container_id,
                "name": "/" + name,
                "image": image,
                "job": job_id,
            }.items()
        ):
            raise RuntimeError("OpenDDE container identity could not be verified; not started.")
        return self.verify_resources(value)

    def verify_resources(self, value):
        """The same hard limits apply to managed native services and task containers."""
        if not isinstance(value, dict):
            raise RuntimeError("OpenDDE hard resource limits were not applied; not started.")
        expected = {
            "memory": self.memory_mib * 1024**2,
            "memory_swap": self.memory_mib * 1024**2,
            "nano_cpus": self.cpus * 10**9,
            "pids_limit": self.pids,
        }
        if any(
            type(value.get(key)) is not int or value[key] != number
            for key, number in expected.items()
        ) or (
            value.get("oom_kill_disable") is not None and value.get("oom_kill_disable") is not False
        ):
            raise RuntimeError("OpenDDE hard resource limits were not applied; not started.")
        return {**expected, "oom_kill_disable": False}


async def require_support(command):
    code, output = await command(
        "docker", "info", "--format", SUPPORT_FORMAT, timeout=8, separate_stderr=True
    )
    if code:
        raise RuntimeError(
            "Docker resource controllers could not be checked; OpenDDE is unavailable."
        )
    return parse_support(output)


def parse_support(output):
    """Validate controller support at both asynchronous and native IPC boundaries."""
    try:
        value = json.loads(output)
    except (ValueError, TypeError) as exc:
        raise RuntimeError("Docker resource-controller response is invalid.") from exc
    keys = {"memory", "swap", "cpu_quota", "cpu_period", "pids"}
    if (
        not isinstance(value, dict)
        or set(value) != keys
        or any(value[key] is not True for key in keys)
    ):
        raise RuntimeError("Docker cannot enforce OpenDDE memory, no-swap, CPU and process limits.")
    return value


async def verify_created(command, limits, container_id, *, name, image, job_id):
    code, output = await command(
        "docker",
        "container",
        "inspect",
        "--format",
        CONTAINER_FORMAT,
        container_id,
        separate_stderr=True,
    )
    if code:
        raise RuntimeError("Created OpenDDE container could not be verified; not started.")
    try:
        value = json.loads(output)
    except (ValueError, TypeError) as exc:
        raise RuntimeError("Created OpenDDE resource response is invalid; not started.") from exc
    return limits.verify(value, container_id=container_id, name=name, image=image, job_id=job_id)
