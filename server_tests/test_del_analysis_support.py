"""Actual native analysis on controlled count boundaries, not drug-discovery evidence."""

import csv
import json
import os
import sqlite3

import numpy as np
import pytest
from dataset_native_fixture import Native

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_DATASET_NATIVE") != "1",
    reason="Independent native DEL environment in scoped CI",
)


@pytest.fixture
def native(tmp_path, monkeypatch):
    return Native(tmp_path, monkeypatch)


def test_native_support_uses_observed_counts_and_global_per_sample_depths(native):
    method = native.module("del_support").supporting_samples
    comparison = {"selected_columns": [0, 1, 2], "reference_columns": [3], "reference_depth": 1000}
    # Identical pooled counts: one-sample spike and consistent evidence must differ.
    counts = np.array([[90, 0, 0, 0], [30, 30, 30, 0], [0, 0, 0, 0]])
    assert method(
        counts, comparison, [1000] * 4, {"minimum_supporting_samples": 2, "minimum_enrichment": 3}
    ).tolist() == [1, 3, 0]
    # A zero-depth sample cannot satisfy a requirement; never silently reduce it.
    with pytest.raises(ValueError, match="Too few"):
        method(
            counts,
            comparison,
            [1000, 0, 0, 1000],
            {"minimum_supporting_samples": 2, "minimum_enrichment": 3},
        )
    # Pseudocount alone must not make a zero observation a supporting sample.
    assert method(
        np.zeros((1, 4)), comparison, [1, 1, 1, 1000], {"minimum_enrichment": 3}
    ).tolist() == [0]


@pytest.mark.parametrize("unit", ["reads", "reported_counts"])
def test_native_analysis_retains_all_rows_filters_spikes_and_exports_support(native, unit):
    raw = (
        b"DEL_ID,a,b,c,control\nspike,90,0,0,0\nconsistent,30,30,30,0\n"
        b"background,300,300,300,1000\nzero,0,0,0,0\n"
    )
    material = native.material(raw, ".csv", "counts")
    payload = {
        "kind": "deli",
        "mode": "analyze",
        "count_unit": unit,
        "minimum_supporting_samples": 2,
        "samples": [
            {"column": name, "group": "target", "role": "target", "replicate": i}
            for i, name in enumerate(("a", "b", "c"), 1)
        ]
        + [{"column": "control", "group": "matrix", "role": "matrix"}],
        "comparisons": [{"id": "matched", "selection": "target", "reference": "matrix"}],
    }
    task = native.task("del_analyze", payload, [material])
    native.module("native_del_analysis").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["observed_members"] == 4
    assert result.counts["prioritized_comparisons"] == 1
    assert [row.id for row in result.candidates] == ["consistent"]
    database = sqlite3.connect(native.root / "output/analysis.sqlite")
    rows = {
        row[0]: row[1:]
        for row in database.execute(
            "SELECT member,prioritizable,supporting_samples,target_samples,flags FROM enrichment"
        )
    }
    database.close()
    assert rows["spike"][:3] == (0, 1, 3)
    assert "insufficient_sample_support" in json.loads(rows["spike"][3])
    assert rows["consistent"][:3] == (1, 3, 3)
    with (native.root / "output/enrichment.csv").open(newline="") as stream:
        exported = list(csv.DictReader(stream))
    assert len(exported) == 4 and all(row["target_samples"] == "3" for row in exported)
    method = json.loads((native.root / "output/analysis-method.json").read_text())
    assert method["minimum_supporting_samples"] == 2
    if unit == "reported_counts":
        assert "external_processing_unverified" in method["interval_scope"]
        assert any("not independently verified" in warning for warning in result.warnings)
