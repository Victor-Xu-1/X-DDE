"""Shared attach/exit verification; adapters retain scientific output normalization."""

import json
import subprocess

from .managed_containers import attached_container


def remove_finished(container):
    """A timed-out client does not prove removal failed or that it succeeded."""
    try:
        subprocess.run(
            ["docker", "rm", container], check=True, capture_output=True, text=True, timeout=15
        )
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        try:
            inspection = subprocess.run(
                ["docker", "inspect", "--format", "{{json .State}}", container],
                check=False,
                capture_output=True,
                text=True,
                timeout=15,
            )
            missing = inspection.returncode and inspection.stderr.strip().lower() in {
                "error: no such object: " + container,
                "error response from daemon: no such container: " + container,
            }
            if missing:
                daemon = subprocess.run(
                    ["docker", "info", "--format", "{{json .ServerVersion}}"],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
                version = json.loads(daemon.stdout)
                if isinstance(version, str) and version.strip():
                    return
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        raise RuntimeError("Owned native container removal could not be confirmed.") from error


def attach(directory, prefix):
    container = attached_container(prefix, directory.name)
    code = subprocess.run(["docker", "start", "--attach", container], check=False).returncode
    inspection = subprocess.run(
        ["docker", "inspect", "--format", "{{json .State}}", container],
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
        remove_finished(container)
    if code or state.get("Running") or state.get("ExitCode") != 0 or state.get("OOMKilled"):
        raise RuntimeError(
            "Native scientific container did not finish successfully; inspect native-exit.json."
        )
