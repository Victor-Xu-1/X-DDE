"""Bounded owned GPU-loader probe; container unlinking is separate from execution."""

import json
import re
import subprocess
from pathlib import Path
from uuid import uuid4

SCRIPT = (
    "import ctypes,pathlib,json;ctypes.CDLL('libcuda.so.1');"
    "print(json.dumps(sorted({s.split()[-1] for s in "
    "pathlib.Path('/proc/self/maps').read_text().splitlines() "
    "if 'libcuda_loader.so' in s})))"
)


def inspect(identifier):
    result = subprocess.run(
        ["docker", "container", "inspect", identifier],
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode:
        if result.returncode == 1 and any(
            marker + identifier in result.stderr
            for marker in ("No such container: ", "No such object: ")
        ):
            return None
        raise ValueError("The compute setup probe could not be inspected.")
    return json.loads(result.stdout)[0]


def owned(current, identifier, connection, nonce):
    if current is None:
        return
    labels = current.get("Config", {}).get("Labels", {})
    if (
        current.get("Id") != identifier
        or current.get("Config", {}).get("Image") != connection["image"]
        or labels.get("org.xdde.owner") != "X-DDE"
        or labels.get("org.xdde.state") != connection["state_id"]
        or labels.get("org.xdde.probe") != nonce
    ):
        raise ValueError("The compute setup probe belongs to another instance.")


def cleanup(identifier, connection, nonce):
    current = inspect(identifier)
    owned(current, identifier, connection, nonce)
    if current is None:
        return "removed"
    if current["State"]["Running"]:
        subprocess.run(
            ["docker", "stop", "--time", "2", identifier],
            check=True,
            capture_output=True,
            text=True,
            timeout=6,
        )
        current = inspect(identifier)
        owned(current, identifier, connection, nonce)
    if current is None:
        return "removed"
    if current["State"]["Running"] or current["State"].get("Pid") != 0:
        raise ValueError("The compute setup probe has not stopped; no service was started.")
    try:
        subprocess.run(
            ["docker", "rm", identifier],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        # A dead exact-ID container can be awaiting filesystem unlinking. It must
        # not keep a completed loader probe or a new service launch waiting.
        pass
    current = inspect(identifier)
    owned(current, identifier, connection, nonce)
    if current is None:
        return "removed"
    status = current.get("State", {})
    if status.get("Status") == "removing" and not status.get("Running") and status.get("Pid") == 0:
        return "cleanup_pending"
    raise ValueError("The compute setup probe could not be safely cleaned up.")


def load_cuda(connection, limits, shared):
    directory = Path(shared) / "native-probes"
    directory.mkdir(exist_ok=True, mode=0o700)
    nonce = uuid4().hex
    cid = directory / (nonce + ".cid")
    record = directory / (nonce + ".json")
    evidence = {
        "container_name": "xdde-native-cuda-" + nonce[:12],
        "state_id": connection["state_id"],
        "image": connection["image"],
        "phase": "starting",
        "resource_limits": limits.model_dump(),
    }
    with record.open("x") as stream:
        json.dump(evidence, stream, indent=2)
    command = [
        "docker",
        "run",
        "--name",
        "xdde-native-cuda-" + nonce[:12],
        "--cidfile",
        str(cid),
        "--label",
        "org.xdde.owner=X-DDE",
        "--label",
        "org.xdde.state=" + connection["state_id"],
        "--label",
        "org.xdde.probe=" + nonce,
        *limits.arguments(),
        "--network",
        "none",
        "--gpus",
        "all",
        "--entrypoint",
        "python",
        connection["image"],
        "-c",
        SCRIPT,
    ]
    result = None
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
    finally:
        if cid.is_file():
            identifier = cid.read_text().strip()
            if not re.fullmatch(r"[a-f0-9]{64}", identifier):
                raise ValueError("The compute setup probe has an invalid identity.")
            phase = cleanup(identifier, connection, nonce)
            evidence.update(
                container_id=identifier,
                phase=phase,
                returncode=result.returncode if result else None,
                stdout=result.stdout[-2000:] if result else None,
            )
        else:
            evidence.update(phase="identity_not_confirmed")
        record.write_text(json.dumps(evidence, indent=2))
    if not cid.is_file():
        raise ValueError("The compute setup probe identity was not confirmed.")
    loaders = json.loads(result.stdout)
    if (
        not isinstance(loaders, list)
        or len(loaders) != 1
        or not isinstance(loaders[0], str)
        or not re.fullmatch(r"/usr/lib/wsl/drivers/[A-Za-z0-9_.-]+/libcuda_loader\.so", loaders[0])
    ):
        raise ValueError("The native WSL GPU loader could not be verified.")
    return loaders[0]
