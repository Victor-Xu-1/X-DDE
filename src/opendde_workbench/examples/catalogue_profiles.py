"""Explicit immutable catalogue compatibility for previously published public evidence."""

import hashlib
import json
from pathlib import Path

from .catalogue import MANIFEST


def compatible_modules(digest):
    profiles = json.loads(
        Path(__file__).with_name("catalogue-profiles.json").read_text(encoding="utf-8")
    )
    profile = profiles.get(digest)
    if profile is None:
        raise ValueError("The bundle catalogue is not a reviewed published revision.")
    content = {key: value for key, value in MANIFEST.items() if key != "modules"}
    content["files"] = {key: MANIFEST["files"][key] for key in profile["file_keys"]}
    cases = {case["id"]: case for case in MANIFEST["cases"]}
    content["cases"] = [cases[key] for key in profile["case_ids"]]
    if (
        hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        != profile["content_sha256"]
    ):
        raise ValueError("Historical public sources changed; review a new catalogue profile.")
    if any(MANIFEST["modules"].get(key) != value for key, value in profile["modules"].items()):
        raise ValueError("Historical module revisions changed; review a new catalogue profile.")
    return tuple(profile["modules"])
