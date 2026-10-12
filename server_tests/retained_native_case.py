"""Read an exact restored native task without repinning a new scientific template."""

import json
import sqlite3
from pathlib import Path

from opendde_workbench.task_history.kinds import classify_request


def retained_native_case(state: Path, capability: str) -> str:
    path = state / "jobs.sqlite3"
    # The caller restores the checksum-verified case bundle into an isolated state.
    # Current template pins may intentionally differ; scientific records stay intact.
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
        rows = db.execute(
            "SELECT id,request FROM jobs WHERE status='succeeded' ORDER BY id LIMIT 501"
        ).fetchall()
    if len(rows) > 500:
        raise ValueError("Expected a bounded isolated native case state.")
    matches = [
        identifier
        for identifier, request in rows
        if classify_request(json.loads(request)) == capability
    ]
    if len(matches) != 1:
        raise ValueError(f"Require one genuine retained native task for {capability}.")
    return matches[0]
