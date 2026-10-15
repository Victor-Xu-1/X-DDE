"""Preserve real frontend-submitted case bytes without treating success as acceptance."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path, PurePosixPath


def retain_case(page, base, identifier, directory):
    directory.mkdir(parents=True, exist_ok=False)
    documents = {}
    for endpoint in ("", "/environment", "/logs", "/result", "/artifacts"):
        response = page.request.get(base + "/api/jobs/" + identifier + endpoint, timeout=30000)
        name = endpoint.strip("/") or "job"
        documents[name] = response.json() if response.ok else {"http_status": response.status}
        (directory / (name + ".json")).write_text(
            json.dumps(documents[name], indent=2), encoding="utf-8"
        )
    artifacts = documents["artifacts"]
    assert isinstance(artifacts, list) and sum(item["size"] for item in artifacts) <= 128 * 1024**2
    digests = {}
    for item in artifacts:
        name = item["name"]
        path = PurePosixPath(name)
        assert not path.is_absolute() and not any(part in {".", ".."} for part in path.parts)
        assert not any(char in name for char in ("\\", ":", "\0"))
        target = directory / "native-files" / path
        assert target.resolve().is_relative_to(directory.resolve())
        response = page.request.get(
            base + "/api/jobs/" + identifier + "/download", params={"name": name}, timeout=30000
        )
        assert response.ok
        data = response.body()
        assert len(data) == item["size"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        digests[name] = hashlib.sha256(data).hexdigest()
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    with sqlite3.connect(f"file:{state / 'jobs.sqlite3'}?mode=ro", uri=True) as source:
        with sqlite3.connect(directory / "jobs.sqlite3") as destination:
            source.backup(destination)
    receipt = {
        "job_id": identifier,
        "submitted_through_frontend": True,
        "revision": os.environ["GITHUB_SHA"],
        "execution_location": "isolated_github_actions",
        "status": documents["job"]["status"],
        "files": digests,
        "native_success": documents["job"]["status"] == "succeeded",
        "scientific_review": "pending_independent_review",
        "fixed_example": False,
        "new_md_fep_calculations": 0,
    }
    (directory / "acceptance.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return documents
