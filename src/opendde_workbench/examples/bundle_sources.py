"""Keep original archive receipts portable without changing evidence or validation."""

import hashlib
import json

from ..artifacts import contained
from ..discovery.import_runner import validate_import_result
from .bundle_archive import safe_path


def archive_sources(job, output, *, recover=False):
    if job.request.operation != "reference_import":
        return {}
    task = job.request
    value = json.loads(contained(output, "result.json").read_bytes())
    expected = task.identifier + "." + task.format
    count = 1 if task.source == "pdb" else 2
    receipts = value.get("receipts")
    if (
        value.get("request") != task.model_dump(mode="json")
        or value.get("artifact") != expected
        or not isinstance(receipts, list)
        or len(receipts) != count
        or any(
            not isinstance(receipt, dict)
            or receipt.get("artifact") != f"source-{index:02d}.snapshot"
            for index, receipt in enumerate(receipts, 1)
        )
    ):
        raise ValueError("Archive source inventory does not match the retained request.")
    last = safe_path(output, f"source-{count:02d}.snapshot")
    created = False
    try:
        if recover and not last.exists():
            # Legacy exports omitted .snapshot files from the download inventory.
            # Only the final raw archive response is byte-identical to its material.
            raw = contained(output, expected).read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            if (
                not raw
                or len(raw) > 8 * 1024**2
                or not (digest == value.get("sha256") == receipts[-1].get("response_sha256"))
            ):
                raise ValueError("Missing source receipt cannot be recovered from identical bytes.")
            with last.open("xb") as stream:
                stream.write(raw)
            created = True
        validate_import_result(value, task, output)
        return {receipt["artifact"]: contained(output, receipt["artifact"]) for receipt in receipts}
    except Exception:
        if created:
            last.unlink()
        raise
