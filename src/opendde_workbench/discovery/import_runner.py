"""Download one archive record without modifying chemical state, structure or coordinates."""

import hashlib
import json
from datetime import UTC, datetime

from .transport import SourceUnavailable, fetch, request_bytes


def run_import(task, output):
    identifier = task.identifier
    receipts = []
    if task.source == "pdb":
        archive_id = identifier.lower() if identifier.startswith("PDB_") else identifier
        url = "https://files.rcsb.org/download/" + archive_id + "." + task.format
        raw, receipt = request_bytes(url, None, require_json=False)
        receipts.append(receipt)
        artifact = identifier + "." + task.format
        kind = "structure"
    else:
        metadata, receipt = fetch(
            "https://www.ebi.ac.uk/chembl/api/data/molecule/" + identifier + ".json"
        )
        if metadata.get("molecule_chembl_id") != identifier:
            raise SourceUnavailable("ChEMBL molecule identity differs from the selected record.")
        receipts.append(receipt)
        url = "https://www.ebi.ac.uk/chembl/api/data/molecule/" + identifier + ".sdf"
        raw, receipt = request_bytes(url, None, require_json=False)
        receipts.append(receipt)
        artifact = identifier + ".sdf"
        kind = "molecule"
    from .archive import validate_archive

    validate_archive(raw, task)
    (output / artifact).write_bytes(raw)
    for index, receipt in enumerate(receipts, 1):
        name = f"source-{index:02d}.snapshot"
        snapshot = receipt.pop("raw_document")
        (output / name).write_bytes(snapshot)
        receipt["artifact"] = name
    return {
        "operation": "reference_import",
        "complete": True,
        "schema_version": 1,
        "request": task.model_dump(mode="json"),
        "retrieved_at": datetime.now(UTC).isoformat(),
        "source": task.source,
        "identifier": identifier,
        "artifact": artifact,
        "kind": kind,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "receipts": receipts,
        "preparation": "original_archive_bytes_not_prepared_or_bound_pose",
        "evidence": task.evidence.model_dump(mode="json") if task.evidence else None,
        "activity_id": task.activity_id,
    }


def validate_import_result(value, task, output):
    from ..artifacts import contained

    if (
        not isinstance(value, dict)
        or value.get("operation") != "reference_import"
        or value.get("complete") is not True
    ):
        raise ValueError("Archive import result is invalid.")
    if (
        value.get("request") != task.model_dump(mode="json")
        or value.get("identifier") != task.identifier
        or value.get("source") != task.source
    ):
        raise ValueError("Archive result does not match the selected request.")
    expected = task.identifier + "." + task.format
    if value.get("artifact") != expected:
        raise ValueError("Archive result artifact identity changed.")
    file = contained(output, expected)
    if file.stat().st_size > 8 * 1024**2 or hashlib.sha256(
        file.read_bytes()
    ).hexdigest() != value.get("sha256"):
        raise ValueError("Imported archive bytes changed.")
    receipts = value.get("receipts")
    if not isinstance(receipts, list) or len(receipts) != (1 if task.source == "pdb" else 2):
        raise ValueError("Archive source evidence is incomplete.")
    from urllib.parse import urlsplit

    for index, receipt in enumerate(receipts, 1):
        if not isinstance(receipt, dict):
            raise ValueError("Archive receipt must be a structured object.")
        if receipt.get("artifact") != f"source-{index:02d}.snapshot":
            raise ValueError("Archive snapshot name changed.")
        address = urlsplit(receipt.get("url", ""))
        host = "files.rcsb.org" if task.source == "pdb" else "www.ebi.ac.uk"
        if (
            address.scheme != "https"
            or address.hostname != host
            or address.username
            or address.password
        ):
            raise ValueError("Archive evidence source changed.")
        snapshot = contained(output, receipt["artifact"])
        if snapshot.stat().st_size > 8 * 1024**2 or hashlib.sha256(
            snapshot.read_bytes()
        ).hexdigest() != receipt.get("response_sha256"):
            raise ValueError("Archive source snapshot changed.")
    if receipts[-1]["response_sha256"] != value["sha256"]:
        raise ValueError("Imported material and source snapshot differ.")
    if task.source == "chembl":
        doc = json.loads(contained(output, receipts[0]["artifact"]).read_bytes())
        if not isinstance(doc, dict) or doc.get("molecule_chembl_id") != task.identifier:
            raise ValueError("ChEMBL snapshot identifies another molecule.")
    expected_kind = "structure" if task.source == "pdb" else "molecule"
    if (
        value.get("schema_version") != 1
        or value.get("kind") != expected_kind
        or value.get("evidence")
        != (task.evidence.model_dump(mode="json") if task.evidence else None)
        or value.get("activity_id") != task.activity_id
        or value.get("preparation") != "original_archive_bytes_not_prepared_or_bound_pose"
    ):
        raise ValueError("Archive provenance or preparation scope changed.")
    stamp = value.get("retrieved_at")
    if not isinstance(stamp, str) or datetime.fromisoformat(stamp).utcoffset() is None:
        raise ValueError("Archive retrieval timestamp requires a timezone.")
    expected_urls = (
        [
            "https://files.rcsb.org/download/"
            + (task.identifier.lower() if task.identifier.startswith("PDB_") else task.identifier)
            + "."
            + task.format
        ]
        if task.source == "pdb"
        else [
            "https://www.ebi.ac.uk/chembl/api/data/molecule/" + task.identifier + extension
            for extension in (".json", ".sdf")
        ]
    )
    if [r["url"] for r in receipts] != expected_urls:
        raise ValueError("Archive record URL differs from the selected identity.")
    from .archive import validate_archive

    validate_archive(file.read_bytes(), task)
    return value
