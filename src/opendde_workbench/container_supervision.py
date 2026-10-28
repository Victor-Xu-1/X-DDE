"""Shared attach/exit/cancellation; adapters retain scientific output normalization."""

import json
import subprocess

from . import container_runtime, local_process
from .managed_containers import attached_container
from .native_container_cleanup import remove_finished


async def stop_owned(directory, container, script, execute, *, label):
    """Attempt both owned boundaries; neither failure can count as confirmed cleanup."""
    try:
        runtime = container_runtime.read(directory)
        code, text = await runtime.command(execute, "docker", "rm", "--force", container)
        missing = code == 1 and text.strip().lower() in {
            "error response from daemon: no such container: " + container.lower(),
            "error: no such container: " + container.lower(),
        }
        if code and not missing:
            raise RuntimeError(f"{label} container cancellation is unconfirmed.")
    finally:
        # Daemon loss, malformed receipts, client timeouts and caller cancellation
        # must not orphan the recorded host group. Its existing kernel-identity
        # checks still apply, and a local failure retains the daemon exception.
        await local_process.stop(script, directory)


def attach(directory, prefix):
    container = attached_container(prefix, directory.name)
    runtime = container_runtime.read(directory)
    code = runtime.run(
        ["docker", "start", "--attach", container], runner=subprocess.run, check=False
    ).returncode
    inspection = runtime.run(
        ["docker", "inspect", "--format", "{{json .State}}", container],
        runner=subprocess.run,
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    state = json.loads(inspection.stdout)
    (directory / "native-exit.json").write_text(
        json.dumps(
            {
                key: state.get(key)
                for key in ("Running", "ExitCode", "OOMKilled", "StartedAt", "FinishedAt")
            }
        )
    )
    if not state.get("Running"):
        remove_finished(container, directory / "native-cleanup.json", runtime=runtime)
    if code or state.get("Running") or state.get("ExitCode") != 0 or state.get("OOMKilled"):
        raise RuntimeError(
            "Native scientific container did not finish successfully; inspect native-exit.json."
        )
