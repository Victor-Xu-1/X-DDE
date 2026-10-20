"""Shared attach/exit verification; adapters retain scientific output normalization."""

import json
import subprocess

from .managed_containers import attached_container
from .native_container_cleanup import remove_finished


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
        remove_finished(container, directory / "native-cleanup.json")
    if code or state.get("Running") or state.get("ExitCode") != 0 or state.get("OOMKilled"):
        raise RuntimeError(
            "Native scientific container did not finish successfully; inspect native-exit.json."
        )
