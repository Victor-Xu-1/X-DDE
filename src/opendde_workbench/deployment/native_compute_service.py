"""Execute under the reviewed native Harness interpreter. Never handles LLM setup."""

import json
import os
import subprocess
import sys
import traceback
from pathlib import Path
from urllib.parse import urlsplit

if __package__:
    from . import native_compute_limits as resources
    from .native_compute_probe import load_cuda
else:
    import native_compute_limits as resources
    from native_compute_probe import load_cuda


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


def launch_arguments(connection, root, checkpoint, resource_limits=None):
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
        # Pin the protocol-compatible endpoint instead of inheriting Harness's
        # older Protenix default. This is operator configuration, never task JSON.
        env={"MMSEQS_SERVICE_HOST_URL": connection["msa_url"]},
    )
    port = urlsplit(connection["url"]).port
    args, env = create_arguments(
        settings, connection["token"], "", name=connection["container"], port=port
    )
    limits = resources.policy(resource_limits)
    limit_flags = resources.launch_flags(args, limits)
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
        *limit_flags,
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
        loader = load_cuda(connection, limits, shared)
        linker = shared / "native-linker"
        linker.mkdir(exist_ok=True)
        link = linker / "libcuda.so"
        if link.is_symlink():
            if str(link.readlink()) != loader:
                link.unlink()
        elif link.exists():
            raise ValueError("The native linker path contains an unowned file.")
        if not link.is_symlink():
            link.symlink_to(loader)
        env["LIBRARY_PATH"] = str(linker)
    index = reviewed.index("--entrypoint")
    # Native factory already includes env names; add only scoped compatibility extras.
    existing = {reviewed[i + 1] for i, value in enumerate(reviewed[:-1]) if value == "--env"}
    reviewed[index:index] = [part for key in env if key not in existing for part in ("--env", key)]
    return reviewed, env


def confirm_service(connection, wait_for_service):
    """The upstream probe may wrap subprocess arguments in an ordinary exception."""
    try:
        wait_for_service(connection["url"], connection["token"], "local", timeout=65)
    except Exception as exc:
        # Keep the original chained traceback in the private lifecycle diagnostic.
        # Never pass arbitrary upstream commands or filesystem paths to the UI.
        raise ValueError(
            "Compute readiness could not be confirmed. "
            "Check the current service status before retrying."
        ) from exc


def execute(message):
    from opendde_harness.cli.onboard_compute import docker, inspect_container, wait_for_service

    connection, action = message["connection"], message["action"]
    limits = resources.policy(message.get("resource_limits"))
    name = connection["container"]
    current = inspect_container(name)
    owned(current, connection)
    cleanup_pending = bool(current and current.get("State", {}).get("Status") == "removing")
    if cleanup_pending and action != "status":
        raise ValueError(
            "This compute service is still cleaning up. Wait before changing it again."
        )
    running = bool(current and current.get("State", {}).get("Running"))
    value = health(connection) if running else None
    if action in {"stop", "retire"} and running:
        idle(value)
        docker("stop", name)
        running, value = False, None
    elif action == "start":
        if current and not resources.verified(current, limits):
            current = resources.apply_existing(
                current, limits, inspect_container, owned, connection, lambda: idle(value)
            )
        if not running:
            resources.require_support()
            if current:
                docker("start", current["Id"])
            else:
                args, env = launch_arguments(
                    connection,
                    Path(message["root"]),
                    message["checkpoint"],
                    limits.model_dump(),
                )
                docker(*args, env=env)
            current = inspect_container(name)
            owned(current, connection)
            if (
                current is None
                or not current.get("State", {}).get("Running")
                or not resources.verified(current, limits)
            ):
                raise ValueError("Native compute limits were not applied; service is unavailable.")
            confirm_service(connection, wait_for_service)
            running, value = True, health(connection)
    elif action not in {"status", "start", "stop", "retire"}:
        raise ValueError("Unknown native compute lifecycle action.")
    if action == "retire" and current is not None:
        # A stopped instance can be removed only after the ownership check above.
        docker("rm", name)
        current = None
    backend = (value or {}).get("workers", {}).get("backend", {})
    limits_verified = bool(current) and resources.verified(current, limits)
    if running and limits_verified:
        resources.require_support()
    ready = (
        not cleanup_pending
        and bool(value)
        and limits_verified
        and all(
            backend.get(key) is True
            for key in ("code_ready", "root_ready", "common_ready", "checkpoint_ready")
        )
    )
    queue = (value or {}).get("workers", {}).get("queue", {})
    return {
        "container": name,
        "running": running,
        "cleanup_pending": cleanup_pending,
        "ready": ready,
        "container_id": current.get("Id") if current else None,
        "resource_limits": limits.model_dump(),
        "resource_limits_verified": limits_verified,
        "model_provider_required": False,
        "queued": queue.get("queued", 0)
        if isinstance(queue.get("queued", 0), int)
        else len(queue.get("queued", [])),
        "active": queue.get("running", 0)
        if isinstance(queue.get("running", 0), int)
        else len(queue.get("running", [])),
        "reason": "This compute service is still cleaning up. Wait before changing it again."
        if cleanup_pending
        else None
        if ready
        else (
            "Apply the native compute update before new tasks; hard resource limits are unverified."
            if running and not limits_verified
            else "Native compute is stopped or its local resources are not ready."
        ),
    }


if __name__ == "__main__":
    message = json.loads(sys.stdin.read(32768))
    try:
        print(json.dumps({"ok": True, "result": execute(message)}))
    except Exception as exc:
        token = message.get("connection", {}).get("token", "")
        error = str(exc).replace(token, "[redacted]") if token else str(exc)
        diagnostic = (
            traceback.format_exc().replace(token, "[redacted]") if token else traceback.format_exc()
        )
        if isinstance(exc, (subprocess.SubprocessError, OSError)):
            error = (
                "Compute setup did not finish. Check the current service status before retrying."
            )
        print(json.dumps({"ok": False, "error": error[:1000], "diagnostic": diagnostic[-8000:]}))
