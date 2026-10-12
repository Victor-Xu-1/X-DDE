"""Preserve an actually paused, owned preparation container during service recovery."""

import json
from pathlib import Path

from .engine import command
from .managed_containers import container_name

FORMAT = (
    '{"name":{{json .Name}},"paused":{{json .State.Paused}},'
    '"running":{{json .State.Running}},"mounts":{{json .Mounts}},'
    '"program":{{json (index .Config.Labels "org.xdde.science.program")}}}'
)


def owned_pause(value, identifier, job_id, directory):
    if value.get("paused") is not True:
        return False
    expected = container_name(identifier, job_id, preparation=True)
    if value.get("name") != "/" + expected or value.get("running") is not True:
        raise ValueError("The paused native lifetime does not match its task identity.")
    mounts = {item["Destination"]: item for item in value.get("mounts", [])}
    for destination, path, writable in (
        ("/platform", directory / "adapter", False),
        ("/output", directory / "output", True),
    ):
        mount = mounts.get(destination)
        if not mount or (
            mount.get("Type") != "bind"
            or Path(mount.get("Source", "")).resolve() != path.resolve()
            or mount.get("RW") is not writable
        ):
            raise ValueError("The paused container belongs to a different scientific workspace.")
    if value.get("program") != identifier:
        raise ValueError("The paused container does not retain its scientific program identity.")
    return True


async def retained_pause(identifier, job_id, directory):
    name = container_name(identifier, job_id, preparation=True)
    code, output = await command("docker", "inspect", "--format", FORMAT, name)
    if code:
        if "no such object" in output.lower() or "no such container" in output.lower():
            return False
        raise RuntimeError("Cannot verify the native paused task. Restore Docker connectivity.")
    return owned_pause(json.loads(output), identifier, job_id, directory)
