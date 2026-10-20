"""Imported count semantics and sample-consistency gates retain historical request bytes."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.datasets.del_options import DELOptions


def design():
    return {
        "mode": "analyze",
        "samples": [
            {"column": name, "group": "target", "role": "target", "replicate": i}
            for i, name in enumerate(("a", "b", "c"), 1)
        ]
        + [{"column": "control", "group": "matrix", "role": "matrix"}],
        "comparisons": [{"id": "matched", "selection": "target", "reference": "matrix"}],
    }


def test_support_default_retains_historical_wire_and_replays_explicit_threshold():
    original = DELOptions(**design())
    assert "minimum_supporting_samples" not in original.model_dump()
    chosen = DELOptions(**design(), minimum_supporting_samples=2)
    assert chosen.model_dump()["minimum_supporting_samples"] == 2
    assert DELOptions.model_validate_json(chosen.model_dump_json()) == chosen


@pytest.mark.parametrize("value", [0, 4, 65, True, 1.5, "2"])
def test_invalid_sample_support_is_not_clipped_or_coerced(value):
    with pytest.raises(ValidationError):
        DELOptions(**design(), minimum_supporting_samples=value)


def test_support_requires_explicit_comparisons_and_reported_counts_require_import():
    with pytest.raises(ValidationError, match="explicit enrichment comparison"):
        DELOptions(mode="count", minimum_supporting_samples=2)
    without = design() | {"comparisons": []}
    with pytest.raises(ValidationError, match="explicit enrichment comparison"):
        DELOptions(**without, minimum_supporting_samples=2)
    with pytest.raises(ValidationError, match="imported enrichment"):
        DELOptions(mode="count", count_unit="reported_counts")
    source = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    task = DatasetTask(
        operation="del_analyze",
        name="Imported count provenance",
        inputs=[{"role": "counts", "source": source}],
        scientific_inputs=[source],
        payload=design() | {"count_unit": "reported_counts"},
    )
    assert task.payload.count_unit == "reported_counts"
    with pytest.raises(ValidationError, match="imported count table"):
        DatasetTask(
            operation="del_analyze",
            name="Native count provenance",
            sources=[{"role": "counts", "job_id": str(uuid4()), "report_sha256": "b" * 64}],
            payload=task.payload,
        )
