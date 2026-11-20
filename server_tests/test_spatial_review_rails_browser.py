"""Compare the desktop structure canvas and candidate rail using retained results."""

import csv
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_stat6_pocket_handoff_browser import assert_pocket_desktop_rail

CASES = (
    ("p2rank.detect", ".pocket-result-workspace"),
    ("gnina.dock", ".docking-results"),
    ("biopython.exposure", ".surface-results"),
)


def inspect_rail(page, table, evidence, zh):
    toolbar = table.locator(".research-table-toolbar")
    search = toolbar.get_by_role("searchbox")
    columns = toolbar.get_by_text("显示指标" if zh else "Columns", exact=True)
    export = toolbar.get_by_role(
        "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True,
    )
    bounds = [item.bounding_box() for item in (search, export)]
    assert all(bounds) and max(box["y"] for box in bounds) - min(
        box["y"] for box in bounds
    ) <= 6
    assert toolbar.bounding_box()["height"] <= 66
    assert table.locator(".research-table-scroll").evaluate(
        "node => node.scrollWidth <= node.clientWidth + 1"
    )
    original = table.locator("tbody tr").count()
    assert original > 1
    search.fill("no-result-for-layout-check")
    expect(export).to_be_disabled()
    search.fill("")
    expect(table.locator("tbody tr")).to_have_count(original)
    summary = toolbar.locator(".table-columns summary")
    if summary.count():
        expect(columns).to_have_count(1)
        summary.press("Enter")
        expect(toolbar.locator(".table-columns fieldset")).to_be_visible()
        summary.press("Enter")
        expect(toolbar.locator(".table-columns fieldset")).to_be_hidden()
    with page.expect_download() as downloaded:
        export.press("Enter")
    path = evidence / downloaded.value.suggested_filename
    downloaded.value.save_as(path)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        records = list(csv.reader(handle))
    assert len(records) > 2 and len(records[0]) >= 3
    assert all(len(record) == len(records[0]) for record in records[1:])
    return {"toolbar": toolbar.bounding_box(), "exported": len(records) - 1}


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1280, 720), ("zh", "dark", 1440, 800),
    ("en", "light", 1920, 1000),
])
def test_spatial_review_rails(language, theme, width, height):
    zh = language == "zh"
    folder = Path("outputs/spatial-review-rails") / f"{language}-{width}"
    folder.mkdir(parents=True, exist_ok=True)
    settings = Settings.from_env()
    with platform(settings.state_dir, folder / "service.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []
        page.on("request", lambda request: (
            writes.append(request.url) if request.method == "POST" else None
        ))
        observed = {}
        for capability, selector in CASES:
            route = f"{base}/api/examples/{capability}?profile=stat6"
            job = page.request.get(route).json()["pin"]["job_id"]
            page.goto(f"{base}/#task={job}")
            result = page.locator(selector)
            frame = result.locator(".structure-workbench-view .molecular-stage iframe")
            button = result.get_by_role("button", name=(
                "生成三维视图图片" if zh else "Capture 3D view"
            ), exact=True)
            expect(button).to_be_enabled(timeout=30000)
            table = result.locator(".structure-workbench-details [data-compact-toolbar]").first
            expect(table).to_be_visible()
            canvas, right = frame.bounding_box(), table.bounding_box()
            assert canvas and right and canvas["width"] >= 540
            assert canvas["x"] + canvas["width"] <= right["x"]
            assert canvas["height"] >= 355 and canvas["y"] + canvas["height"] <= height
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if capability == "p2rank.detect":
                assert_pocket_desktop_rail(result, width)
            page.screenshot(path=folder / f"{capability}.png")
            checked = inspect_rail(page, table, folder, zh)
            observed[capability] = {"canvas": canvas, **checked}
        assert not writes
        (folder / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
