"""Offline real models; original, changed, unchanged and unsupported sequences stay distinct."""

import hashlib
import json
from pathlib import Path

from manifest import MAX_RECORDS, METADATA_DIGEST, VERSIONS
from native_domains import number, validate_proposal_numbering
from native_evaluation import evaluate
from native_inputs import inputs
from native_models import verify_resources
from options import HumanizationOptions


def run(request, bindings, directory, output):
    import torch

    options = HumanizationOptions.model_validate(request["options"])
    records = inputs(request, bindings, directory)
    verify_resources()
    torch.set_num_threads(options.cpu)
    torch.set_num_interop_threads(1)
    numbering_model, domains = number(records, options.cpu, output)
    eligible = [
        record
        for record in records
        if domains[record["id"]]["available"]
        and (options.format != "vhh_exploratory" or domains[record["id"]]["chain_type"] == "H")
    ]
    database = None
    if eligible:
        from promb import init_db

        database = init_db("human-oas", verbose=False)
    rows = []
    for index, record in enumerate(records):
        domain = domains[record["id"]]
        row = {
            "record": index,
            "source_id": record["id"],
            "source_sequence": record["sequence"],
            "status": "failed",
            "reason": domain.get("reason"),
            "numbering": [],
            "chain_type": None,
            "numbering_score": None,
            "original_scores": None,
            "original_evaluation": None,
            "proposal": None,
            "proposal_scores": None,
            "proposal_evaluation": None,
            "proposal_numbering": [],
            "proposal_chain_type": None,
            "proposal_numbering_score": None,
            "iterations": [],
            "artifact": None,
            "artifact_sha256": None,
        }
        if not domain["available"]:
            rows.append(row)
            continue
        if options.format == "vhh_exploratory" and domain["chain_type"] != "H":
            row["reason"] = "vhh_requires_a_heavy_chain_domain"
            rows.append(row)
            continue
        values = evaluate(record, domain, options, database)
        row.update(
            status="evaluated",
            reason=None,
            numbering=domain["numbering"],
            chain_type=domain["chain_type"],
            numbering_score=domain["score"],
            **values,
        )
        if row["proposal"]:
            candidate = validate_proposal_numbering(
                numbering_model,
                f"proposal-{index + 1:03d}",
                row["proposal"],
                domain,
                output,
                index + MAX_RECORDS,
            )
            row["proposal_numbering"] = candidate["numbering"]
            row["proposal_chain_type"] = candidate["chain_type"]
            row["proposal_numbering_score"] = candidate["score"]
            file = f"humanized-{index + 1:03d}.fasta"
            content = (f">humanized-{index + 1:03d}\n" + row["proposal"] + "\n").encode()
            (output / file).write_bytes(content)
            row.update(artifact=file, artifact_sha256=hashlib.sha256(content).hexdigest())
        rows.append(row)
    count = sum(row["status"] == "evaluated" for row in rows)
    return {
        "operation": "antibody_humanize",
        "schema_version": 1,
        "complete": True,
        "source": request["sequences"],
        "options": options.model_dump(mode="json"),
        "metadata_sha256": METADATA_DIGEST,
        "versions": VERSIONS,
        "rows": rows,
        "evaluated_count": count,
        "proposal_count": sum(row["proposal"] is not None for row in rows),
        "classification": "complete" if count == len(rows) else "partial" if count else "empty",
        "scheme": "imgt",
        "sapiens_executed": bool(eligible),
        "scope": "sequence_reference_evaluation_and_protected_framework_proposals",
        "clinical_immunogenicity": "not_predicted",
        "binding_retention": "not_established",
        "paired_chain_compatibility": "not_evaluated",
        "vhh_scope": "human_heavy_reference_exploration_only"
        if options.format == "vhh_exploratory"
        else "conventional_vh_vl",
    }


def main():
    directory, output = Path("/input"), Path("/output")
    request = json.loads((directory / "request.json").read_text())
    if request["operation"] != "antibody_humanize":
        raise ValueError("Unsupported antibody evaluation operation.")
    report = run(request, json.loads((directory / "bindings.json").read_text()), directory, output)
    file = output / "result.json.tmp"
    file.write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    file.replace(output / "result.json")


if __name__ == "__main__":
    main()
