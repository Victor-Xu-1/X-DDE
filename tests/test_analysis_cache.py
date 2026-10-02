"""Opening a result must preserve the sealed native output inventory."""

import asyncio
import json
from types import SimpleNamespace

from opendde_workbench.analysis import AnalysisService


def test_derived_preview_cache_does_not_change_native_output(tmp_path):
    job = SimpleNamespace(id="public-case")
    directory = tmp_path / job.id
    output = directory / "output"
    output.mkdir(parents=True)
    native = output / "prediction.cif"
    native.write_bytes(b"native scientific coordinates")
    # Old display caches inside output are not accepted as the current cache.
    derived = directory / "analysis"
    derived.mkdir()
    report = {"schema_version": 4, "candidates": []}
    (derived / "workbench-analysis.json").write_text(json.dumps(report))
    service = AnalysisService(SimpleNamespace(), tmp_path)
    assert asyncio.run(service.get(job)) == report
    assert [file.name for file in output.iterdir()] == ["prediction.cif"]
    assert native.read_bytes() == b"native scientific coordinates"
