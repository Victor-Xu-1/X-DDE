"""Professional DELi counting receives only complete UMIs; raw member calls remain intact."""

import hashlib
import json
import os
import sqlite3
from collections import Counter
from uuid import uuid4

import pytest
from dataset_native_fixture import Native

from opendde_workbench.datasets.del_umi import summary

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_DATASET_NATIVE") != "1",
    reason="Native DELi counting runs in scoped CI or scientific acceptance",
)


def source(native, *, assessed=True, defined=True):
    root = native.root / "sources" / str(uuid4())
    root.mkdir()
    file = root / "decoded.sqlite"
    database = sqlite3.connect(file)
    database.execute("CREATE TABLE reads(sample,library,member,cycles,umi,count,umi_status)")
    database.executemany(
        "INSERT INTO reads VALUES (?,?,?,?,?,?,?)",
        [
            (
                "sample",
                "DEL006",
                "member",
                '["A035","B040","C030"]',
                "ACGTACGTACG",
                8,
                "complete" if defined else "not_defined",
            ),
            (
                "sample",
                "DEL006",
                "member",
                '["A035","B040","C030"]',
                "ACGTACGTACA",
                1,
                "complete" if defined else "not_defined",
            ),
            (
                "sample",
                "DEL006",
                "partial-only",
                '["A071","B015","C004"]',
                "ACAG",
                3,
                "truncated" if defined else "not_defined",
            ),
        ],
    )
    database.commit()
    database.close()
    evidence = summary(
        {"DEL006": 11 if defined else None},
        Counter(complete=9, truncated=3) if defined else Counter(not_defined=12),
        Counter(complete=2, truncated=1) if defined else Counter(not_defined=3),
    )
    result = {
        "data_kind": "decoded",
        "counts": {"decoded_reads": 12, "distinct_umi_records": 3},
        "metadata": {"umi_integrity": evidence} if assessed else {},
        "artifacts": [
            {
                "name": file.name,
                "size": file.stat().st_size,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            }
        ],
    }
    report = root / "result.json"
    report.write_text(json.dumps(result))
    return {
        "job_id": root.name,
        "role": "decoded",
        "report_sha256": hashlib.sha256(report.read_bytes()).hexdigest(),
    }


@pytest.mark.parametrize("method", ["raw", "unique", "directional", "cluster"])
def test_native_umi_counting_filters_partial_barcodes_without_dropping_member_reads(
    tmp_path, monkeypatch, method
):
    from deli.decode.count import corrected_count

    native = Native(tmp_path, monkeypatch)
    reference = source(native)
    task = native.task(
        "del_count", {"kind": "deli", "mode": "count", "umi_method": method}, sources=[reference]
    )
    native.module("native_del_count").run(task.model_dump(mode="json"))
    result = native.check(task)
    database = sqlite3.connect(native.root / "output/counts.sqlite")
    rows = {
        row[0]: row[1:]
        for row in database.execute(
            "SELECT member,raw,unique_umi,corrected_umi,eligible_reads,excluded_reads FROM counts"
        )
    }
    assert rows["partial-only"] == (
        3,
        None,
        None,
        0,
        3,
    )
    assert rows["member"] == (
        9,
        None if method == "raw" else 2,
        corrected_count({"ACGTACGTACG": 8, "ACGTACGTACA": 1}, method=method)
        if method in {"directional", "cluster"}
        else None,
        9,
        0,
    )
    assert result.counts["counted_reads"] == 12
    assert result.counts["complete_umi_reads"] == 9 and result.counts["excluded_umi_reads"] == 3
    database.close()


@pytest.mark.parametrize(
    ("assessed", "defined", "message"),
    [(False, True, "not assessed"), (True, False, "no defined UMI")],
)
def test_missing_completeness_or_no_umi_definition_cannot_produce_molecule_counts(
    tmp_path, monkeypatch, assessed, defined, message
):
    native = Native(tmp_path, monkeypatch)
    reference = source(native, assessed=assessed, defined=defined)
    task = native.task("del_count", {"kind": "deli", "mode": "count"}, sources=[reference])
    with pytest.raises(ValueError, match=message):
        native.module("native_del_count").run(task.model_dump(mode="json"))


def test_legacy_raw_counts_remain_available_without_inventing_umi_observations(
    tmp_path, monkeypatch
):
    native = Native(tmp_path, monkeypatch)
    reference = source(native, assessed=False)
    task = native.task(
        "del_count", {"kind": "deli", "mode": "count", "umi_method": "raw"}, sources=[reference]
    )
    native.module("native_del_count").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["counted_reads"] == 12
    assert result.metadata["sample_totals"]["sample"]["unique_umi"] is None
    assert "complete_umi_reads" not in result.counts


def test_partial_only_umi_evidence_cannot_be_imputed_as_zero_in_enrichment(tmp_path, monkeypatch):
    native = Native(tmp_path, monkeypatch)
    reference = source(native)
    task = native.task(
        "del_count",
        {"kind": "deli", "mode": "count", "umi_method": "directional"},
        sources=[reference],
    )
    native.module("native_del_count").run(task.model_dump(mode="json"))
    counted = native.capture(task)
    module = native.module("del_count_table")
    request = {
        "sources": [counted],
        "payload": {"count_unit": "corrected_umi", "samples": [{"column": "sample"}]},
    }
    with pytest.raises(ValueError, match="UMI count unit is unavailable"):
        list(module.native_rows(request))
    request["payload"]["count_unit"] = "reads"
    raw = {row[0]: row[-1] for row in module.native_rows(request)}
    assert raw == {"member": [9], "partial-only": [3]}
