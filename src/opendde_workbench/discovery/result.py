"""Independent integrity/identity checks before task success, indexing or UI presentation."""

import hashlib
import json
import re
from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained
from .contract import TargetResearchTask
from .transport import AUTHORITIES


class RetrievalResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: str
    complete: bool
    schema_version: int
    request: TargetResearchTask
    retrieved_at: datetime
    entity: dict
    sources: list[dict] = Field(min_length=1, max_length=3)
    materials: list[dict] = Field(max_length=1)
    activities: dict | None
    scope: str
    score_meaning: str


def validate_result(value, request, output):
    result = RetrievalResult.model_validate(value)
    if (
        result.operation != "target_research"
        or result.schema_version != 1
        or result.complete is not True
        or result.request != request
        or result.entity.get("id") != request.identifier
        or result.retrieved_at.tzinfo is None
    ):
        raise ValueError("Evidence result identity, request or retrieval time is inconsistent.")
    seen = set()
    documents = {}
    for source in result.sources:
        name = source.get("source")
        if name in seen or name not in {"Open Targets", "UniProt", "ChEMBL"}:
            raise ValueError("Evidence source is duplicated or unknown.")
        seen.add(name)
        if source.get("status") not in {"ok", "empty", "ambiguous", "unavailable"}:
            raise ValueError("Evidence source has an unknown status.")
        documents[name] = []
        receipts = source.get("receipts")
        if not isinstance(receipts, list) or len(receipts) > 2:
            raise ValueError("Source receipt count is invalid.")
        for receipt in receipts:
            name_on_disk = receipt.get("artifact", "")
            if not re.fullmatch(r"source-[0-9]{2}\.json", name_on_disk):
                raise ValueError("Source snapshot name is invalid.")
            snapshot = contained(output, name_on_disk)
            if snapshot.stat().st_size > 8 * 1024**2:
                raise ValueError("Source snapshot exceeds the evidence limit.")
            content = snapshot.read_bytes()
            if hashlib.sha256(content).hexdigest() != receipt.get("response_sha256"):
                raise ValueError("Source snapshot changed after retrieval.")
            documents[name].append(json.loads(content))
            address = urlsplit(receipt.get("url", ""))
            if address.scheme != "https" or address.hostname not in AUTHORITIES:
                raise ValueError("Evidence receipt has an unreviewed source.")
            if not re.fullmatch(r"[a-f0-9]{64}", receipt.get("response_sha256", "")):
                raise ValueError("Evidence receipt digest is invalid.")
        if source.get("status") == "ok" and not receipts:
            raise ValueError("Successful retrieval requires source receipts.")
    if result.sources[0]["source"] != "Open Targets" or result.sources[0]["status"] != "ok":
        raise ValueError("The primary evidence source did not succeed.")
    if documents["Open Targets"][0].get("data", {}).get(request.entity) != result.entity:
        raise ValueError("Displayed entity differs from its original source snapshot.")
    association = result.entity.get(
        "associatedTargets" if request.entity == "disease" else "associatedDiseases"
    )
    if not isinstance(association, dict) or not isinstance(association.get("rows"), list):
        raise ValueError("Association evidence is invalid.")
    if (
        len(association["rows"]) > request.limit
        or not isinstance(association.get("count"), int)
        or association["count"] < len(association["rows"])
    ):
        raise ValueError("Association retrieval scope is inconsistent.")
    for row in association["rows"]:
        if not isinstance(row.get("score"), (int, float)) or not 0 <= row["score"] <= 1:
            raise ValueError("Association score is invalid.")
        obj = row.get("target" if request.entity == "disease" else "disease")
        if not isinstance(obj, dict) or not isinstance(obj.get("id"), str):
            raise ValueError("Associated entity identity is invalid.")
    if (request.entity == "disease" or not request.include_materials) and (
        result.materials or result.activities
    ):
        raise ValueError("Unrequested research materials cannot appear in this result.")
    for material in result.materials:
        native = documents.get("UniProt", [])
        if not native or native[0].get("sequence", {}).get("value") != material.get("sequence"):
            raise ValueError("Sequence does not agree with the original UniProt response.")
        if native[0].get("primaryAccession") != material.get("accession"):
            raise ValueError("Sequence accession differs from its source.")
        if not re.fullmatch(r"[A-Z0-9]{6,10}", material.get("accession", "")):
            raise ValueError("Sequence accession is invalid.")
        file = contained(output, material.get("artifact", ""))
        if file.name != material["accession"] + ".fasta" or file.stat().st_size > 200000:
            raise ValueError("Sequence evidence file is unsafe or oversized.")
        if hashlib.sha256(file.read_bytes()).hexdigest() != material.get("sha256"):
            raise ValueError("Sequence evidence changed after retrieval.")
        lines = file.read_text().splitlines()
        if (
            not lines
            or not lines[0].startswith(">")
            or "".join(lines[1:]) != material.get("sequence")
        ):
            raise ValueError("Sequence artifact and evidence do not agree.")
        if len(material.get("structures", [])) > request.limit:
            raise ValueError("Structure references exceed the requested scope.")
    if result.activities is not None and len(result.activities.get("rows", [])) > request.limit:
        raise ValueError("Activity records exceed the requested scope.")
    if result.activities and result.activities.get("status") == "ok":
        native = documents.get("ChEMBL", [])
        if len(native) != 2 or native[1].get("activities", [])[
            : request.limit
        ] != result.activities.get("rows"):
            raise ValueError("Activity evidence differs from its original ChEMBL response.")
    return result
