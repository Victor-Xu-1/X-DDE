"""A frozen real reported-data example remains interactive without importing again."""

import csv
import hashlib

from playwright.sync_api import expect
from test_navigation_shell_browser import open_navigation

RECORD = "3d3140eb-4576-5e95-b503-e64794657cea"
SOURCE_SHA = "92568eae46bd175c537e446427c9784a6743cfbb3761986da532385cf43c3ad3"


def review_experimental_example(page, base, language, evidence):
    zh = language == "zh"
    open_navigation(page, language).get_by_role(
        "button", name="性质与安全性" if zh else "Properties and safety", exact=True
    ).click()
    page.locator(".module-task-picker select:visible").select_option("experimental.evidence")
    page.locator(".module-template:visible").get_by_role(
        "button", name="示例结果" if zh else "Example results", exact=True
    ).click()
    region = page.get_by_role(
        "region", name="实验数据结果" if zh else "Experimental evidence results", exact=True
    )
    expect(region).to_be_visible()
    detail = page.request.get(base + "/api/examples/experimental.evidence").json()
    assert detail["record_pin"]["record_id"] == RECORD
    assert not detail["record_pin"]["evidence"]
    document = page.request.get(base + "/api/research/evidence/" + RECORD).json()
    assert len(document["observations"]) == 38
    assert document["request"]["conditions"]["species"] == ""
    assert document["source_sha256"] == SOURCE_SHA
    assert not region.locator('iframe[src*="viewer.html"]').count()
    point = region.get_by_role("button", name="CHEMBL487451 = 0.7 nM", exact=True)
    point.click()
    expect(point).to_have_attribute("aria-pressed", "true")
    expect(region.locator(".evidence-structure h3")).to_have_text("CHEMBL487451")
    drawing = region.locator(".molecule-image")
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    drawing.locator("img").evaluate("image => image.decode()")
    page.screenshot(path=str(evidence / "stat6-reported-plot-selection.png"), full_page=True)
    region.get_by_role(
        "table", name="原始实测记录" if zh else "Reported observations", exact=True
    ).get_by_role("row").filter(has_text="CHEMBL512894").click()
    expect(region.locator(".evidence-structure h3")).to_have_text("CHEMBL512894")
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    drawing.locator("img").evaluate("image => image.decode()")
    page.screenshot(path=str(evidence / "stat6-reported-table-selection.png"), full_page=True)
    with page.expect_download() as transfer:
        region.get_by_role(
            "link",
            name="下载原始实验文件" if zh else "Download original experimental file",
            exact=True,
        ).click()
    original = evidence / "stat6-reported-original.csv"
    transfer.value.save_as(original)
    assert hashlib.sha256(original.read_bytes()).hexdigest() == SOURCE_SHA
    with page.expect_download() as transfer:
        region.get_by_role(
            "link", name="下载实测表格" if zh else "Download observations", exact=True
        ).click()
    output = evidence / "stat6-reported-observations.csv"
    transfer.value.save_as(output)
    with output.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 38
    for row, source in zip(rows, document["observations"], strict=True):
        assert row["compound"] == source["compound"]
        assert row["reported_value"] == source["reported_value"]
        assert row["reported_relation"] == source["relation"]
        assert row["reported_unit"] == "nM"
        assert row["species"] == row["temperature_c"] == row["ph"] == ""
    return {
        "reported_observations": 38,
        "record_id": RECORD,
        "source_sha256": SOURCE_SHA,
        "mouse_and_table_links": True,
        "original_and_normalized_downloads": True,
        "model_inference_executed": False,
    }
