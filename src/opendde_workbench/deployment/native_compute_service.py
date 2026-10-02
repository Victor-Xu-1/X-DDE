"""Execute under the reviewed native Harness interpreter. Never handles LLM setup."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit


def owned(container, connection):
    if container is None:
        return
    labels = container.get("Config", {}).get("Labels", {})
    if (
        labels.get("org.xdde.owner") != "X-DDE"
        or connection.get("container_id")
        and connection["container_id"] != container.get("Id")
        or not connection.get("container_id")
        and labels.get("org.xdde.state") != connection["state_id"]
    ):
        raise ValueError("The named container is not owned by this X-DDE instance.")
    if container["Config"]["Image"] != connection["image"]:
        raise ValueError("Owned service image differs from its reviewed configuration.")


def health(connection):
    from opendde_harness.plugin.protein_design.servers.local_service import service_health

    return service_health(connection["url"], connection["token"], timeout=5)


def idle(value):
    queue = (value or {}).get("workers", {}).get("queue")
    if not isinstance(queue, dict) or queue.get("running") or queue.get("queued"):
        raise ValueError("Finish native compute tasks before stopping the service.")


def launch_arguments(connection, root, checkpoint):
    from opendde_harness.cli.onboard_compute import DockerSettings, create_arguments

    shared = Path(connection["shared_dir"])
    shared.mkdir(parents=True, exist_ok=True, mode=0o700)
    settings = DockerSettings(
        image=connection["image"],
        mode="local",
        gpus="all",
        package_root=connection["code"],
        state_dir=str(shared),
        output_dir=str(shared),
        opendde_data=str(root / "models/opendde"),
        opendde_common=str(root / "models/opendde/common"),
        opendde_checkpoint=str(root / "models/opendde/checkpoint" / checkpoint),
        weights_dir=str(root / "models/harness"),
        code_mode="managed",
        idle_seconds=86400,
        shm_size="2g",
    )
    port = urlsplit(connection["url"]).port
    args, env = create_arguments(
        settings, connection["token"], "", name=connection["container"], port=port
    )
    reviewed, index = [], 0
    while index < len(args):
        if args[index] == "--rm":
            index += 1
            continue
        if connection["network"] == "host" and args[index] == "--publish":
            index += 2
            continue
        if connection["network"] == "host" and args[index].startswith("--add-host="):
            index += 1
            continue
        reviewed.append(args[index])
        index += 1
    index = reviewed.index("--detach") + 1
    reviewed[index:index] = [
        "--restart",
        "unless-stopped",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--label",
        "org.xdde.owner=X-DDE",
        "--label",
        "org.xdde.state=" + connection["state_id"],
    ]
    if connection["network"] == "host":
        reviewed[index:index] = ["--network", "host"]
        reviewed[reviewed.index("--host") + 1] = "127.0.0.1"
        reviewed[reviewed.index("--port") + 1] = str(port)
        for name in (
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "NO_PROXY",
            "http_proxy",
            "https_proxy",
            "no_proxy",
        ):
            if name in os.environ:
                env[name] = os.environ[name]
    # Probe only the installed image and its native GPU loader; no shared daemon changes.
    if Path("/proc/sys/kernel/osrelease").read_text().lower().find("microsoft") >= 0:
        probe = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--network",
                "none",
                "--gpus",
                "all",
                "--entrypoint",
                "python",
                connection["image"],
                "-c",
                (
                    "import ctypes,pathlib,json;ctypes.CDLL('libcuda.so.1');"
                    "print(json.dumps(sorted({s.split()[-1] for s in "
                    "pathlib.Path('/proc/self/maps').read_text().splitlines() "
                    "if 'libcuda_loader.so' in s})))"
                ),
            ],
            capture_output=True,
            text=True,
            timeout=25,
            check=True,
        )
        loaders = json.loads(probe.stdout)
        if len(loaders) != 1 or not re.fullmatch(
            r"/usr/lib/wsl/drivers/[A-Za-z0-9_.-]+/libcuda_loader\.so", loaders[0]
        ):
            raise ValueError("The native WSL CUDA loader could not be verified.")
        linker = shared / "native-linker"
        linker.mkdir(exist_ok=True)
        link = linker / "libcuda.so"
        if link.is_symlink():
            if str(link.readlink()) != loaders[0]:
                link.unlink()
        elif link.exists():
            raise ValueError("The native linker path contains an unowned file.")
        if not link.is_symlink():
            link.symlink_to(loaders[0])
        env["LIBRARY_PATH"] = str(linker)
    index = reviewed.index("--entrypoint")
    # Native factory already includes env names; add only scoped compatibility extras.
    existing = {reviewed[i + 1] for i, value in enumerate(reviewed[:-1]) if value == "--env"}
    reviewed[index:index] = [part for key in env if key not in existing for part in ("--env", key)]
    return reviewed, env


def execute(message):
    from opendde_harness.cli.onboard_compute import docker, inspect_container, wait_for_service

    connection, action = message["connection"], message["action"]
    name = connection["container"]
    current = inspect_container(name)
    owned(current, connection)
    running = bool(current and current.get("State", {}).get("Running"))
    value = health(connection) if running else None
    if action in {"stop", "retire"} and running:
        idle(value)
        docker("stop", name)
        running, value = False, None
    elif action == "start" and not running:
        if current:
            docker("start", name)
        else:
            args, env = launch_arguments(connection, Path(message["root"]), message["checkpoint"])
            docker(*args, env=env)
        wait_for_service(connection["url"], connection["token"], "local", timeout=65)
        running, value = True, health(connection)
    elif action not in {"status", "start", "stop", "retire"}:
        raise ValueError("Unknown native compute lifecycle action.")
    if action == "retire" and current is not None:
        # A stopped instance can be removed only after the ownership check above.
        docker("rm", name)
    backend = (value or {}).get("workers", {}).get("backend", {})
    ready = bool(value) and all(
        backend.get(key) is True
        for key in ("code_ready", "root_ready", "common_ready", "checkpoint_ready")
    )
    queue = (value or {}).get("workers", {}).get("queue", {})
    return {
        "container": name,
        "running": running,
        "ready": ready,
        "model_provider_required": False,
        "queued": queue.get("queued", 0)
        if isinstance(queue.get("queued", 0), int)
        else len(queue.get("queued", [])),
        "active": queue.get("running", 0)
        if isinstance(queue.get("running", 0), int)
        else len(queue.get("running", [])),
        "reason": None
        if ready
        else "Native compute is stopped or its local resources are not ready.",
    }


if __name__ == "__main__":
    message = json.loads(sys.stdin.read(32768))
    try:
        print(json.dumps({"ok": True, "result": execute(message)}))
    except Exception as exc:
        token = message.get("connection", {}).get("token", "")
        error = str(exc).replace(token, "[redacted]") if token else str(exc)
        print(json.dumps({"ok": False, "error": error[:1000]}))
