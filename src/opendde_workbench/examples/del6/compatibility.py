"""Restore the exact published DEL Data1 scope after a reviewed wording correction."""

import hashlib
import json
import re

from . import catalogue


def digest(document):
    return hashlib.sha256(
        json.dumps(document, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    ).hexdigest()


def compatible_modules(previous_digest):
    if not isinstance(previous_digest, str) or not re.fullmatch(r"[a-f0-9]{64}", previous_digest):
        raise ValueError("The DEL bundle catalogue identity is invalid.")
    registry = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_text(encoding="utf-8"))
    if registry.get("schema_version") != 1:
        raise ValueError("The DEL catalogue registry is invalid.")
    profiles = registry["catalogues"]
    current = profiles.get(digest(catalogue.MANIFEST))
    previous = profiles.get(previous_digest)
    if current is None or previous is None:
        raise ValueError("The DEL catalogue is not a reviewed published revision.")
    if current.get("module_ids") != sorted(catalogue.MODULES):
        raise ValueError("The reviewed current DEL module scope changed.")
    name = previous.get("manifest_file", "")
    if not re.fullmatch(r"manifest-v[1-9][0-9]*\.json", name):
        raise ValueError("The historical DEL manifest is unavailable.")
    path = catalogue.ROOT / name
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 8 * 1024**2:
        raise ValueError("The historical DEL manifest is unavailable.")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != previous.get("manifest_sha256"):
        raise ValueError("The historical DEL manifest changed.")
    original = json.loads(raw)
    if digest(original) != previous_digest:
        raise ValueError("The historical DEL catalogue differs from its published identity.")
    # This migration admits a wording correction, never replacement inputs,
    # source revisions, module contracts, chemical definitions or native output.
    old_science = {key: value for key, value in original.items() if key != "case"}
    current_science = {key: value for key, value in catalogue.MANIFEST.items() if key != "case"}
    old_case = {key: value for key, value in original["case"].items() if key != "description"}
    current_case = {
        key: value for key, value in catalogue.MANIFEST["case"].items() if key != "description"
    }
    if old_science != current_science or old_case != current_case:
        raise ValueError("Historical DEL scientific sources or module definitions changed.")
    selected = previous.get("module_ids")
    if (
        not isinstance(selected, list)
        or not selected
        or len(set(selected)) != len(selected)
        or not set(selected) <= set(catalogue.MODULES)
    ):
        raise ValueError("The published DEL bundle module scope is invalid.")
    return tuple(selected)
