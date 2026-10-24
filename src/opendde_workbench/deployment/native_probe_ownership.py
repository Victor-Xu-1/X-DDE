"""Verify exact installation-probe ownership before observing or cleaning a container."""

import json
import re
import subprocess

from .. import container_runtime
from ..native_container_cleanup import remove_finished

TOKEN_LABEL = "org.xdde.install.probe"
PROGRAM_LABEL = "org.xdde.install.program"


def owned_probe(value, name, token, identifier, image):
    labels = value.get("Config", {}).get("Labels") or {}
    if (
        not re.fullmatch(r"[a-f0-9]{64}", value.get("Id", ""))
        or value.get("Name") != "/" + name
        or value.get("Image") != image
        or labels.get(TOKEN_LABEL) != token
        or labels.get(PROGRAM_LABEL) != identifier
        or not isinstance(value.get("State"), dict)
    ):
        raise RuntimeError("Native installation probe ownership could not be verified.")
    return value


def inspect_owned(name, token, identifier, image, runtime=None):
    runtime = runtime or container_runtime.DockerRuntime()
    result = runtime.run(
        ["docker", "inspect", "--format", "{{json .}}", name],
        runner=subprocess.run,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode == 1 and result.stderr.strip().lower() in {
        "error: no such object: " + name,
        "error response from daemon: no such container: " + name,
    }:
        return None
    result.check_returncode()
    return owned_probe(json.loads(result.stdout), name, token, identifier, image)


def cleanup_probe(name, token, identifier, image, directory, record, *, runtime=None):
    runtime = runtime or container_runtime.read(directory)
    value = inspect_owned(name, token, identifier, image, runtime)
    if value is not None:
        record["cleanup_observed_state"] = value["State"]
    container = name if value is None else value["Id"]
    if value is not None and value["State"].get("Running"):
        # Cancellation can terminate the attached client before its container.
        # Stop only the container whose unique ownership was just verified.
        stopped = runtime.run(
            ["docker", "kill", container],
            runner=subprocess.run,
            capture_output=True,
            text=True,
            timeout=15,
        )
        value = inspect_owned(name, token, identifier, image, runtime)
        if value is not None and value["State"].get("Running"):
            raise RuntimeError("Owned installation probe did not stop.")
        if stopped.returncode and value is not None and value["State"].get("Status") != "exited":
            stopped.check_returncode()
    remove_finished(container, directory / "native-cleanup.json", runtime=runtime)
