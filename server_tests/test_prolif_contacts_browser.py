"""Native chemical contacts share one source in tables, 3D and downloadable data."""

import csv
import io
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import settings


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_original_prolif_contacts_and_downloads(language, width):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence/prolif-contacts")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        count = len(page.request.get(base + "/api/jobs").json())
        info = page.request.get(base + "/api/examples/diffsbdd.interactions?profile=archive").json()
        identifier = info["pin"]["job_id"]
        native = page.request.get(base + f"/api/jobs/{identifier}/result").json()
        assert native["interactions"] and all(
            "start" in row and "end" in row for row in native["interactions"]
        )
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        page.goto(base + "/#task=" + identifier)
        results = page.get_by_role(
            "region",
            name="分子相互作用结果" if language == "zh" else "Molecular interaction results",
            exact=True,
        )
        expect(results).to_be_visible()
        table = results.get_by_role(
            "table", name="残基化学接触" if language == "zh" else "Residue chemical contacts"
        )
        expect(table.locator("tbody tr")).to_have_count(len(native["interactions"]))
        expect(
            results.get_by_role(
                "button", name="生成三维视图图片" if language == "zh" else "Capture 3D view"
            )
        ).to_be_enabled(timeout=30000)
        expect(results.get_by_role("alert")).to_have_count(0)
        assert not results.get_by_text(
            "接触明细" if language == "zh" else "Contact details", exact=True
        ).count()
        with page.expect_download() as pending:
            table.locator("..").locator("..").get_by_role(
                "button", name="导出筛选结果" if language == "zh" else "Export filtered rows"
            ).click()
        target = evidence / (language + "-contacts.csv")
        pending.value.save_as(target)
        rows = list(csv.DictReader(io.StringIO(target.read_text(encoding="utf-8-sig"))))
        assert len(rows) == len(native["interactions"])
        distance_key = "距离 (Å)"
        if language == "en":
            distance_key = "Distance (Å)"
        assert sorted(float(row[distance_key]) for row in rows) == sorted(
            row["distance"] for row in native["interactions"]
        )
        with page.expect_download() as pending:
            results.get_by_role(
                "link",
                name="下载原生接触记录" if language == "zh" else "Download native contact records",
                exact=True,
            ).click()
        raw = evidence / (language + "-interactions.json")
        pending.value.save_as(raw)
        assert json.loads(raw.read_text())["interactions"]
        assert len(page.request.get(base + "/api/jobs").json()) == count and not errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / f"native-{language}-{width}.png", full_page=True)
        browser.close()
