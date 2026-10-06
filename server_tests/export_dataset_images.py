"""Export only reviewed runtime images for checksum-verified offline installation; no weights."""

import hashlib
import json
import subprocess
from pathlib import Path
from uuid import uuid4

from opendde_workbench.deployment.installers import install
from opendde_workbench.integrations.specs import PROGRAMS


def main():
    root = Path("server_tests/evidence/runtime-images")
    root.mkdir(parents=True)
    components = Path(".dataset-components")
    components.mkdir()
    records = {}
    for program in ("deli", "drugclip"):
        entry = install(program, components, {}, str(uuid4()), print, lambda: None)
        tar = root / (program + ".tar")
        subprocess.run(["docker", "save", "-o", str(tar), entry["image"]], check=True, timeout=900)
        subprocess.run(["zstd", "-T2", "-3", str(tar)], check=True, timeout=900)
        archive = tar.with_suffix(".tar.zst")
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        records[program] = {
            **entry,
            "version": PROGRAMS[program]["version"],
            "archive": archive.name,
            "bytes": archive.stat().st_size,
            "sha256": digest,
        }
        tar.unlink()  # Only this script's confirmed intermediate, after the checksummed export.
    (root / "images.json").write_text(json.dumps(records, indent=2))


if __name__ == "__main__":
    main()
