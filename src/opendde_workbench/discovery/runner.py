"""Read-only public retrieval beneath the existing Worker; no model installation or inference."""

import hashlib
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

from opendde_workbench.discovery.contract import TargetResearchTask
from opendde_workbench.discovery.sources import activities, evidence, protein
from opendde_workbench.discovery.transport import SourceUnavailable


def run(task, output):
    item, receipt = evidence(task.entity, task.identifier, task.limit)
    sources = [{"source": "Open Targets", "status": "ok", "receipts": [receipt]}]
    result = {
        "operation": "target_research",
        "complete": True,
        "schema_version": 1,
        "request": task.model_dump(mode="json"),
        "retrieved_at": datetime.now(UTC).isoformat(),
        "entity": item,
        "sources": sources,
        "materials": [],
        "activities": None,
        "scope": "human_target_database_evidence",
        "score_meaning": "Open Targets association, not potency or causal proof",
    }
    if task.entity != "target" or not task.include_materials:
        return result
    reviewed = [
        p["id"] for p in item.get("proteinIds", []) if p.get("source") == "uniprot_swissprot"
    ]
    if len(reviewed) != 1:
        sources.append(
            {"source": "UniProt", "status": "ambiguous" if reviewed else "empty", "receipts": []}
        )
        return result
    accession = reviewed[0]
    try:
        data, receipt = protein(accession)
        seq = data.get("sequence", {}).get("value")
        taxon = data.get("organism", {}).get("taxonId")
        if (
            taxon != 9606
            or not isinstance(seq, str)
            or not re.fullmatch(r"[ACDEFGHIKLMNPQRSTVWYBXZOU]{1,100000}", seq)
        ):
            raise SourceUnavailable("UniProt human sequence identity or format is invalid.")
        artifact = accession + ".fasta"
        body = (
            ">"
            + accession
            + " canonical human sequence\n"
            + "\n".join(seq[n : n + 80] for n in range(0, len(seq), 80))
            + "\n"
        )
        (output / artifact).write_text(body, encoding="utf-8")
        structures = [
            x for x in data.get("uniProtKBCrossReferences", []) if x.get("database") == "PDB"
        ]
        result["materials"].append(
            {
                "accession": accession,
                "sequence": seq,
                "artifact": artifact,
                "sha256": hashlib.sha256(body.encode()).hexdigest(),
                "structures": structures[: task.limit],
                "structure_total": len(structures),
                "sequence_scope": "canonical_sequence_not_all_isoforms",
                "comments": data.get("comments", []),
            }
        )
        sources.append({"source": "UniProt", "status": "ok", "receipts": [receipt]})
    except SourceUnavailable as exc:
        sources.append(
            {"source": "UniProt", "status": "unavailable", "reason": str(exc), "receipts": []}
        )
    try:
        rows, receipts = activities(accession, task.limit)
        result["activities"] = rows
        sources.append({"source": "ChEMBL", "status": rows["status"], "receipts": receipts})
    except SourceUnavailable as exc:
        sources.append(
            {"source": "ChEMBL", "status": "unavailable", "reason": str(exc), "receipts": []}
        )
    return result


def freeze_sources(result, output):
    counter = 0
    for source in result["sources"]:
        for receipt in source["receipts"]:
            counter += 1
            raw = receipt.pop("raw_document")
            if hashlib.sha256(raw).hexdigest() != receipt["response_sha256"]:
                raise ValueError("Source response changed before evidence capture.")
            artifact = f"source-{counter:02d}.json"
            (output / artifact).write_bytes(raw)
            receipt["artifact"] = artifact


def main():
    directory = Path(sys.argv[1]).resolve()
    task = TargetResearchTask.model_validate_json((directory / "request.json").read_text())
    result = run(task, directory / "output")
    freeze_sources(result, directory / "output")
    file = directory / "output/result.json.tmp"
    file.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    file.replace(directory / "output/result.json")
    print(
        "Public evidence retrieved; each source state and bounded result coverage is recorded.",
        flush=True,
    )


if __name__ == "__main__":
    main()
