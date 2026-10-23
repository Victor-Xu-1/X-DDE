"""Read native binder quality decisions without changing filters, ranks or source files."""

import csv
import hashlib
import io
import math
import re

REPORT = "native/designs/final_ranked_designs/all_designs_metrics.csv"
METRICS = {
    "interface_confidence": "design_to_target_iptm",
    "complex_confidence": "complex_plddt",
    "binder_refold_confidence": "designfolding-complex_plddt",
    "binder_refold_rmsd": "filter_rmsd_design",
    "complex_refold_rmsd": "filter_rmsd",
    "buried_area": "delta_sasa_refolded",
}


def parse_design_report(data, expected_count):
    if not 0 < len(data) <= 16 * 1024**2:
        raise ValueError("The native binder report is empty or exceeds its size budget.")
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    fields = reader.fieldnames or []
    required = {"file_name", "designed_sequence", "pass_filters", *METRICS.values()}
    if len(fields) != len(set(fields)) or not required <= set(fields):
        raise ValueError("The complete native binder report is missing its quality columns.")
    rows, identifiers = [], set()
    for row in reader:
        if len(rows) >= expected_count or None in row or any(v is None for v in row.values()):
            raise ValueError("The native binder report has extra, truncated or malformed rows.")
        name, sequence = row["file_name"], row["designed_sequence"]
        if not re.fullmatch(r"design_[0-9]+\.cif", name) or name in identifiers:
            raise ValueError("Native binder identities must be unique direct design files.")
        if not 8 <= len(sequence) <= 300 or not set(sequence) <= set("ACDEFGHIKLMNPQRSTVWY"):
            raise ValueError("A native binder sequence is missing or invalid.")
        decisions = {key: value for key, value in row.items() if key.startswith("pass_")}
        if any(value not in {"True", "False"} for value in decisions.values()):
            raise ValueError("A native binder filter decision is missing or invalid.")
        failed = [
            key for key, value in decisions.items() if key != "pass_filters" and value == "False"
        ]
        if row["pass_filters"] == "True" and failed:
            raise ValueError("Native binder overall and individual filter decisions conflict.")
        metrics = {key: float(row[column]) for key, column in METRICS.items()}
        if any(not math.isfinite(value) for value in metrics.values()):
            raise ValueError("The native binder quality report contains non-finite values.")
        if any(not 0 <= metrics[key] <= 1 for key in METRICS if key.endswith("confidence")):
            raise ValueError("Native binder confidence must retain its 0–1 scale.")
        if any(
            metrics[key] < 0 for key in ("binder_refold_rmsd", "complex_refold_rmsd", "buried_area")
        ):
            raise ValueError("Native binder distances and buried area cannot be negative.")
        identifiers.add(name)
        rows.append(
            {
                "native_id": name,
                "sequence": sequence,
                "passed": row["pass_filters"] == "True",
                "failed_filters": failed,
                **metrics,
            }
        )
    if len(rows) != expected_count:
        raise ValueError("The native report does not cover every requested design.")
    return rows


def binder_evidence(output, request, candidates):
    """Project actual retained CSVs, including older jobs, without rewriting result.json."""
    from ..artifacts import contained

    if request.operation != "boltzgen_design":
        return None
    path = output / REPORT
    if not path.exists():
        return None  # Older archives can lack this report; never invent a pass decision.
    path = contained(output, REPORT)
    if not 0 < path.stat().st_size <= 16 * 1024**2:
        raise ValueError("The native binder report exceeds its size budget.")
    data = path.read_bytes()
    rows = parse_design_report(data, request.payload.candidates)
    by_name = {row["native_id"]: row for row in rows}
    selected = (
        output / "native/designs/final_ranked_designs" / f"final_{request.payload.retain}_designs"
    )
    files = sorted(selected.glob("*.cif"))
    if len(files) != len(candidates):
        raise ValueError("The retained binder structures differ from the reported shortlist.")
    for file, candidate in zip(files, candidates, strict=True):
        row = by_name.get(file.name.split("_", 1)[-1])
        if row is None or candidate.artifact is None:
            raise ValueError("The retained binder has no exact native quality row.")
        original = contained(output, file.relative_to(output).as_posix())
        normalized = contained(output, candidate.artifact)
        with original.open("rb") as stream, normalized.open("rb") as copied:
            if (
                hashlib.file_digest(stream, "sha256").digest()
                != hashlib.file_digest(copied, "sha256").digest()
            ):
                raise ValueError("The displayed binder differs from its ranked native structure.")
        row["candidate_id"] = candidate.id
    return {
        "source_artifact": REPORT,
        "source_sha256": hashlib.sha256(data).hexdigest(),
        "attempted": len(rows),
        "passed": sum(row["passed"] for row in rows),
        "retained": len(candidates),
        "designs": rows,
    }
