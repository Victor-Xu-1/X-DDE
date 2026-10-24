"""Time-limited operator leases for task execution; never rewrite installed components."""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from .container_runtime import DockerRuntime, document

FILE = "native-runtime-lease.json"
IMAGE = re.compile(r"(?:[A-Za-z0-9./:_-]+@)?sha256:[a-f0-9]{64}")


def entry_digest(entry):
    encoded = json.dumps(entry, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


@dataclass(frozen=True)
class RuntimeLease:
    image: str
    runtime: DockerRuntime
    identifier: str
    expires_at: str
    source_image: str

    @property
    def provenance(self):
        return {
            "lease_id": self.identifier,
            "lease_expires_at": self.expires_at,
            "source_image": self.source_image,
        }


def validate_provenance(record):
    try:
        UUID(record["lease_id"])
        expires = datetime.fromisoformat(record["lease_expires_at"])
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("Frozen native runtime provenance is invalid.") from error
    if (
        expires.tzinfo is None
        or not isinstance(record["source_image"], str)
        or not IMAGE.fullmatch(record["source_image"])
    ):
        raise ValueError("Frozen native runtime provenance is invalid.")


def active(settings, identifier, source_image, installed_entry):
    state = getattr(settings, "state_dir", None)
    if state is None:
        return None
    path = Path(state) / FILE
    if not path.exists() and not path.is_symlink():
        return None
    record = document(path)
    if not isinstance(record.get("engines"), dict):
        raise ValueError("Temporary native runtime requires an engines mapping.")
    if identifier not in record["engines"]:
        return None
    required = {"schema", "owner", "id", "created_at", "expires_at", "engines"}
    if (
        set(record) != required
        or type(record["schema"]) is not int
        or record["schema"] != 1
        or record["owner"] != "X-DDE"
    ):
        raise ValueError("Temporary native runtime lease is invalid.")
    try:
        UUID(record["id"])
        created = datetime.fromisoformat(record["created_at"])
        expires = datetime.fromisoformat(record["expires_at"])
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("Temporary native runtime identity or expiry is invalid.") from error
    now = datetime.now(UTC)
    if (
        created.tzinfo is None
        or expires.tzinfo is None
        or not 0 < (expires - created).total_seconds() <= 21600
    ):
        raise ValueError("Temporary native runtime must expire within six hours.")
    if created > now or expires <= now:
        raise RuntimeError("Temporary native runtime is not active; no task was started.")
    entry = record["engines"][identifier]
    if not isinstance(entry, dict) or set(entry) != {
        "image",
        "source_image",
        "source_entry_sha256",
        "container_runtime",
    }:
        raise ValueError("Temporary native runtime engine entry is invalid.")
    if (
        not isinstance(entry["image"], str)
        or not IMAGE.fullmatch(entry["image"])
        or not isinstance(source_image, str)
        or not IMAGE.fullmatch(source_image)
        or entry["source_image"] != source_image
        or entry["source_entry_sha256"] != entry_digest(installed_entry)
    ):
        raise ValueError(
            "Temporary native runtime differs from its original installed environment."
        )
    runtime = DockerRuntime.parse(entry["container_runtime"])
    if runtime.endpoint is None:
        raise ValueError("Temporary native runtime needs an explicit local Docker binding.")
    return RuntimeLease(entry["image"], runtime, record["id"], record["expires_at"], source_image)
