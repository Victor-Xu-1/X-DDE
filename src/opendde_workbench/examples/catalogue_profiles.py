"""Explicit immutable catalogue compatibility for previously published public evidence."""

import hashlib
import json
from pathlib import Path

from .catalogue import MANIFEST


def compatible_modules(digest, *, profile="archive"):
    if profile == "stat6":
        return compatible_study_modules(digest)
    if profile != "archive":
        raise ValueError("The bundle study profile is not a reviewed published revision.")
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


def compatible_study_modules(digest):
    from .stat6 import catalogue

    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_text(encoding="utf-8"))
    profile = profiles.get(digest)
    if profile is None:
        raise ValueError("The study catalogue is not a reviewed published revision.")
    try:
        manifest = {
            **catalogue.MANIFEST,
            "files": {key: catalogue.MANIFEST["files"][key] for key in profile["file_keys"]},
        }
        content = {
            "manifest": manifest,
            "modules": {
                key: catalogue.MODULES[key].model_dump(mode="json") for key in profile["module_ids"]
            },
        }
    except KeyError as exc:
        raise ValueError("Historical study sources or module definitions are unavailable.") from exc
    actual = hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    ).hexdigest()
    if actual != digest:
        raise ValueError("Historical study sources or module revisions changed.")
    return tuple(profile["module_ids"])
