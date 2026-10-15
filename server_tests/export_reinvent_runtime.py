"""Retain the CI-verified image for the owner's ordinary managed installer cache."""

import gzip
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.deployment.scientific_cache import cached_image
from opendde_workbench.integrations.image import lock_digest
from opendde_workbench.integrations.image_identity import composer_digest
from opendde_workbench.integrations.specs import recipe_digest
from opendde_workbench.settings import Settings

runner = Path(os.environ["RUNNER_TEMP"]).resolve()
settings = Settings.from_env()
assert settings.state_dir.resolve().is_relative_to(runner)
runtime = DeploymentManager(settings.state_dir).store.installed().get("reinvent")
if not runtime:
    print("No admitted native runtime to export.")
else:

    def execute(args):
        return subprocess.check_output(args, text=True, timeout=60)

    image = cached_image("reinvent", execute, print)
    assert image == runtime["image"], "Export only the managed CLI-verified image."
    destination = runner / "x-dde-runtime-cache"
    destination.mkdir(exist_ok=False)
    archive = destination / "reinvent-runtime.tar.gz"
    tag = "xdde-reinvent:" + recipe_digest("reinvent")[:16]
    # Preserve the tag so `docker load` restores the ordinary managed cache key.
    with (destination / "image-save.log").open("wb") as log:
        process = subprocess.Popen(
            ["docker", "image", "save", tag], stdout=subprocess.PIPE, stderr=log
        )
        try:
            with gzip.open(archive, "wb", compresslevel=1) as stream:
                shutil.copyfileobj(process.stdout, stream, length=1024 * 1024)
        except BaseException:
            process.terminate()
            raise
        finally:
            process.stdout.close()
            code = process.wait(timeout=120)
        assert code == 0, "Native image export failed; installation metadata is unchanged."
    with archive.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    (destination / "runtime-identity.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "program": "reinvent",
                "revision": os.environ["GITHUB_SHA"],
                "image": image,
                "tag": tag,
                "platform": execute(
                    ["docker", "version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"]
                ).strip(),
                "recipe_sha256": recipe_digest("reinvent"),
                "runtime_lock_sha256": lock_digest("reinvent"),
                "composer_sha256": composer_digest(),
                "archive": archive.name,
                "bytes": archive.stat().st_size,
                "sha256": checksum,
                "scientific_acceptance": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("Exported the exact admitted environment; no task or installed metadata was changed.")
