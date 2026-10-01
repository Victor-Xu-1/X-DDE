"""Independent public-data adapter; process lifecycle remains owned by BackendRouter."""

import hashlib
import json
import sys
from pathlib import Path

from .. import local_process

FILES = (
    "contract.py",
    "sources.py",
    "transport.py",
    "runner.py",
    "result.py",
    "sequence.py",
    "import_contract.py",
    "import_provenance.py",
    "import_runner.py",
    "archive.py",
)


class DiscoveryBackend:
    def __init__(self, settings):
        self.settings = settings

    async def readiness(self):
        return {
            "ready": True,
            "connectivity": "checked_on_request",
            "gpu": False,
            "reason": None,
            "scientific_acceptance": "database_evidence_not_model_validation",
        }

    async def start(self, job, directory):
        # Snapshot content hashes; interpreter imports the installed platform's typed modules.
        root = Path(__file__).parent
        digests = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in FILES}
        (directory / "discovery-execution.json").write_text(
            json.dumps({"adapter_sha256": digests}), encoding="utf-8"
        )
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(root.parent.parent),
            "PYTHONUNBUFFERED": "1",
        }
        return await local_process.start(Path(sys.executable), root / "runner.py", directory, env)

    async def stop(self, job_id, directory):
        await local_process.stop(Path(__file__).with_name("runner.py"), directory)


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError("Public evidence adapter is unavailable.")
    if request.allow_external is not True:
        raise ValueError("Confirm public database queries before retrieval.")
