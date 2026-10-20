"""Bounded reconciliation of one owned removal; never rerun scientific work."""

import json
import subprocess
import time

from .locations import atomic_json

CONFIRM_SECONDS = 45
OBSERVE_SECONDS = 5


def remove_finished(container, receipt=None):
    record = {"container": container, "state": "pending", "observations": []}

    def save():
        if receipt is not None:
            atomic_json(receipt, record)

    save()
    try:
        subprocess.run(
            ["docker", "rm", container], check=True, capture_output=True, text=True, timeout=15
        )
    except (OSError, subprocess.SubprocessError) as error:
        record["removal_client_error"] = type(error).__name__
        deadline = time.monotonic() + CONFIRM_SECONDS
        while time.monotonic() < deadline:
            observed = {"state": "unconfirmed"}
            try:
                timeout = min(OBSERVE_SECONDS, max(0.01, deadline - time.monotonic()))
                inspection = subprocess.run(
                    ["docker", "inspect", "--format", "{{json .State}}", container],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
                missing = inspection.returncode == 1 and inspection.stderr.strip().lower() in {
                    "error: no such object: " + container,
                    "error response from daemon: no such container: " + container,
                }
                if missing:
                    observed["state"] = "absent_daemon_unconfirmed"
                    timeout = min(OBSERVE_SECONDS, max(0.01, deadline - time.monotonic()))
                    daemon = subprocess.run(
                        ["docker", "info", "--format", "{{json .ServerVersion}}"],
                        check=True,
                        capture_output=True,
                        text=True,
                        timeout=timeout,
                    )
                    version = json.loads(daemon.stdout)
                    if isinstance(version, str) and version.strip():
                        record["state"] = "removed"
                        observed["state"] = "absent_confirmed"
                elif inspection.returncode == 0:
                    state = json.loads(inspection.stdout)
                    observed["state"] = "running" if state.get("Running") else "still_present"
                else:
                    observed["state"] = "inspection_failed"
            except (OSError, ValueError, subprocess.SubprocessError) as observation_error:
                observed["error"] = type(observation_error).__name__
            record["observations"].append(observed)
            save()
            if record["state"] == "removed":
                return
            if observed["state"] == "running":
                break
            remaining = deadline - time.monotonic()
            if remaining > 0:
                time.sleep(min(1, remaining))
        record["state"] = "unconfirmed"
        save()
        raise RuntimeError("Owned native container removal could not be confirmed.") from error
    else:
        record["state"] = "removed"
        save()
