"""Inspect immutable native exposure output without scientific execution."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import settings


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_measured_region_locates_without_unrelated_ligand_controls(language, width):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence/module-examples")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        original = len(page.request.get(base + "/api/jobs").json())
        example = page.request.get(base + "/api/examples/biopython.exposure?profile=archive").json()
        identifier = example["pin"]["job_id"]
        native = page.request.get(base + f"/api/jobs/{identifier}/result").json()
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        page.goto(base + "/#task=" + identifier)
        results = page.locator(".surface-results")
        expect(results).to_be_visible()
        count = len(native["regions"])
        caption = "已定位区域残基：" if language == "zh" else "Region residues located: "
        expect(results.get_by_text(caption + f"{count} / {count}", exact=True)).to_be_visible(
            timeout=30000
        )
        expect(
            results.get_by_role(
                "checkbox",
                name="显示相互作用" if language == "zh" else "Show interactions",
                exact=True,
            )
        ).to_have_count(0)
        expect(
            results.get_by_role(
                "combobox", name="中心配体" if language == "zh" else "Central ligand", exact=True
            )
        ).to_have_count(0)
        results.get_by_role(
            "button", name="定位选区" if language == "zh" else "Focus region", exact=True
        ).click()
        results.get_by_role("tab", name="按区域" if language == "zh" else "By region").click()
        expect(results.locator("tbody tr")).to_have_count(count)
        for name in ("regions.csv", "atoms.csv", native["preview_artifact"]):
            download = page.request.get(
                base + f"/api/jobs/{identifier}/download", params={"name": name}
            )
            assert download.ok and download.body()
            (evidence / (language + "-" + name)).write_bytes(download.body())
        assert len(page.request.get(base + "/api/jobs").json()) == original and not errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        (evidence / (language + "-native.json")).write_text(json.dumps(native), encoding="utf-8")
        page.screenshot(path=evidence / f"surface-{language}-{width}.png", full_page=True)
        browser.close()
