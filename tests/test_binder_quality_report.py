"""Real failed native designs stay rejected through the existing result API contract."""

import csv
import hashlib
import io
import json
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench.integrations.binder_evidence import REPORT, parse_design_report
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.result import validate_result

FIXTURE = Path(__file__).with_name("fixtures") / "boltzgen"


def data():
    raw = (FIXTURE / "all_designs_metrics.csv").read_bytes()
    provenance = json.loads((FIXTURE / "provenance.json").read_text(encoding="utf-8-sig"))
    assert hashlib.sha256(raw).hexdigest() == provenance["native_report_sha256"]
    return raw


def changed(column, value):
    reader = csv.DictReader(io.StringIO(data().decode("utf-8-sig")))
    rows = list(reader)
    rows[0][column] = value
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=reader.fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue().encode()


def test_actual_native_report_retains_all_four_rejections_and_score_scales():
    rows = parse_design_report(data(), 4)
    assert len(rows) == 4 and not any(row["passed"] for row in rows)
    best = next(row for row in rows if row["native_id"] == "design_3.cif")
    assert best["interface_confidence"] == 0.62484
    assert best["binder_refold_confidence"] == 0.69724
    assert best["failed_filters"] == ["pass_ALA_fraction_filter"]
    assert best["sequence"].count("A") / len(best["sequence"]) == 0.4
    assert best["buried_area"] == 1027.30518


@pytest.mark.parametrize(
    "column,value",
    [
        ("pass_filters", "unknown"),
        ("pass_filters", "True"),
        ("design_to_target_iptm", "NaN"),
        ("complex_plddt", "82"),
        ("filter_rmsd", "-1"),
        ("designed_sequence", "ACDX"),
    ],
)
def test_missing_invalid_or_contradictory_quality_is_not_a_pass(column, value):
    with pytest.raises(ValueError):
        parse_design_report(changed(column, value), 4)


def fixture(tmp_path):
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    request = IntegratedTask.model_validate(
        {
            "operation": "boltzgen_design",
            "name": "Sealed binder result transport fixture",
            "inputs": [{"role": "structure", "source": ref}],
            "scientific_inputs": [ref],
            "payload": {"kind": "boltzgen", "target_chains": ["A"], "candidates": 4, "retain": 2},
            "options": {"device": "cuda"},
        }
    )
    report = tmp_path / REPORT
    report.parent.mkdir(parents=True)
    report.write_bytes(data())
    selected = report.parent / "final_2_designs"
    selected.mkdir()
    candidates, files = [], {}
    for ordinal, native in enumerate(("design_3.cif", "design_1.cif"), 1):
        content = (
            "Sealed structure-copy transport fixture; not native inference: " + native
        ).encode()
        (selected / f"rank{ordinal}_{native}").write_bytes(content)
        name = f"binder-{ordinal:03d}.cif"
        (tmp_path / name).write_bytes(content)
        files[name] = hashlib.sha256(content).hexdigest()
        candidates.append({"id": f"binder-{ordinal:03d}", "artifact": name})
    value = {
        "operation": "boltzgen_design",
        "program": "boltzgen",
        "version": "0.3.2",
        "candidates": candidates,
        "artifact_sha256": files,
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
    }
    return request, value, report


def test_older_completed_result_gets_exact_quality_without_source_rewrite(tmp_path):
    request, value, report = fixture(tmp_path)
    before = {
        file.relative_to(tmp_path): file.read_bytes()
        for file in tmp_path.rglob("*")
        if file.is_file()
    }
    result = validate_result(value, request, tmp_path)
    assert result.binder_quality.passed == 0
    assert result.binder_quality.attempted == 4 and result.binder_quality.retained == 2
    best = next(row for row in result.binder_quality.designs if row.candidate_id == "binder-001")
    assert best.native_id == "design_3.cif" and not best.passed
    assert result.binder_quality.source_sha256 == hashlib.sha256(report.read_bytes()).hexdigest()
    assert "binder_quality" not in value
    assert before == {
        file.relative_to(tmp_path): file.read_bytes()
        for file in tmp_path.rglob("*")
        if file.is_file()
    }
    value["binder_quality"] = result.binder_quality.model_dump()
    value["binder_quality"]["designs"][0]["interface_confidence"] = 1
    with pytest.raises(ValueError, match="differs"):
        validate_result(value, request, tmp_path)


def test_unavailable_history_stays_unconfirmed_and_truncated_report_is_rejected(tmp_path):
    request, value, report = fixture(tmp_path)
    report.unlink()
    assert validate_result(value, request, tmp_path).binder_quality is None
    report.write_bytes(data().splitlines()[0] + b"\n")
    with pytest.raises(ValueError, match="every requested design"):
        validate_result(value, request, tmp_path)


def test_selected_structure_must_match_ranked_native_copy(tmp_path):
    request, value, report = fixture(tmp_path)
    (report.parent / "final_2_designs/rank1_design_3.cif").write_text("changed")
    with pytest.raises(ValueError, match="ranked native structure"):
        validate_result(value, request, tmp_path)
