"""Library-bound UMI completeness and honest read-only paging; no scientific inference."""

import sqlite3
from collections import Counter
from copy import deepcopy
from types import SimpleNamespace

import pytest

from opendde_workbench.datasets.decoded_view import page
from opendde_workbench.datasets.del_umi import (
    counting_summary,
    expected_lengths,
    read_summary,
    summary,
    umi_status,
)


def evidence():
    return summary(
        {"DEL006": 11}, Counter(complete=709, truncated=1), Counter(complete=702, truncated=1)
    )


@pytest.mark.parametrize(
    ("observed", "expected", "state"),
    [
        ("ACGTACGTACG", 11, "complete"),
        ("ACAG", 11, "truncated"),
        ("ACGTACGTACGT", 11, "too_long"),
        ("ACNTACGTACG", 11, "ambiguous"),
        ("", 11, "missing"),
        ("ACAG", None, "not_defined"),
    ],
)
def test_umi_assessment_uses_original_schema_not_the_observed_length(observed, expected, state):
    assert umi_status(observed, expected) == state


def test_original_library_lengths_and_unassessed_historical_evidence():
    assert expected_lengths(
        {
            "libraries": {
                "defined": {"barcode_schema": {"umi": {"tag": "N" * 11}}},
                "without": {"barcode_schema": {}},
            }
        }
    ) == {"defined": 11, "without": None}
    assert read_summary(None, 710, 703) is None
    assert read_summary(evidence(), 710, 703) == evidence()


def test_counting_intake_rejects_unassessed_umi_methods_without_silent_raw_fallback():
    counts = {"decoded_reads": 710, "distinct_umi_records": 703}
    with pytest.raises(ValueError, match="not assessed"):
        counting_summary({}, counts, "directional")
    assert counting_summary({}, counts, "raw") is None
    assert counting_summary({"umi_integrity": evidence()}, counts, "unique") == evidence()


@pytest.mark.parametrize("change", ["total", "impossible", "bool", "extra", "length"])
def test_contradictory_completeness_is_rejected(change):
    value = deepcopy(evidence())
    if change == "total":
        value["reads_by_status"]["truncated"] = 0
    elif change == "impossible":
        value["records_by_status"].update(complete=701, truncated=2)
    elif change == "bool":
        value["records_by_status"]["truncated"] = True
    elif change == "extra":
        value["reads_by_status"]["invented"] = 0
    else:
        value["expected_lengths"]["DEL006"] = 0
    with pytest.raises(ValueError):
        read_summary(value, 710, 703)


def test_decoded_member_paging_retains_partial_umi_and_literal_search():
    database = sqlite3.connect(":memory:")
    database.row_factory = sqlite3.Row
    database.execute("CREATE TABLE reads(sample,library,member,umi,count,umi_status)")
    database.executemany(
        "INSERT INTO reads VALUES (?,?,?,?,?,?)",
        [
            ("public", "DEL006", "DEL006-A071-B015-C004", "ACAG", 1, "truncated"),
            ("public", "DEL006", "literal_%", "ACGTACGTACG", 2, "complete"),
        ],
    )
    result = SimpleNamespace(
        metadata={"umi_integrity": evidence()}, counts={"distinct_umi_records": 2}
    )
    first = page(database, result, limit=1, offset=0, search="")
    assert first["has_more"] and first["rows"][0]["reads"] == 2
    second = page(database, result, limit=1, offset=1, search="")
    assert second["rows"][0]["observed_length"] == 4
    assert second["rows"][0]["expected_length"] == 11
    assert second["rows"][0]["umi_status"] == "truncated"
    assert not second["has_more"]
    assert len(page(database, result, limit=20, offset=0, search="_%")["rows"]) == 1
    assert database.total_changes == 2
    database.close()


def test_historical_table_never_infers_completeness_from_length():
    database = sqlite3.connect(":memory:")
    database.row_factory = sqlite3.Row
    database.execute("CREATE TABLE reads(sample,library,member,umi,count)")
    database.execute("INSERT INTO reads VALUES ('sample','DEL006','member','ACGT',1)")
    result = SimpleNamespace(metadata={}, counts={"distinct_umi_records": 1})
    row = page(database, result, limit=20, offset=0, search="")["rows"][0]
    assert row["umi_status"] is None and row["expected_length"] is None
    assert row["observed_length"] == 4
    database.close()
