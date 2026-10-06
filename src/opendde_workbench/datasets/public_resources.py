"""Reviewed public download metadata, independent of scientific computation/readiness."""

import hashlib
import json
from pathlib import Path

FILE = Path(__file__).with_name("public_resources.json")
MANIFEST = json.loads(FILE.read_text(encoding="utf-8"))
VERSION = MANIFEST["version"]
RESOURCES = {row["id"]: row for row in MANIFEST["resources"]}


def manifest_digest():
    return hashlib.sha256(FILE.read_bytes()).hexdigest()


def available_files(assets, state):
    from ..locations import read_json

    config = read_json(state / "deployment.json")
    installed = read_json(Path(config["root"]) / "installed.json") if config else {}
    entry = installed.get("supplier-libraries", {})
    files = entry.get("files", {}) if entry.get("manifest_sha256") == manifest_digest() else {}
    result = []
    for key, resource in RESOURCES.items():
        asset = None
        if key in files:
            try:
                retained = assets.get(files[key]["id"])
                if (retained.kind, retained.sha256, retained.size) == (
                    "library",
                    resource["sha256"],
                    resource["size"],
                ):
                    assets.path(retained)
                    asset = retained.model_dump()
            except (OSError, ValueError):
                pass
        result.append(
            {
                **{
                    key: resource[key]
                    for key in (
                        "id",
                        "supplier",
                        "label",
                        "raw_records",
                        "id_column",
                        "source_page",
                        "scope",
                    )
                },
                "asset": asset,
                "screening_index_ready": False,
            }
        )
    return result
