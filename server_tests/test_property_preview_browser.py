"""Exact native file selection, calculated 3D and source preservation; no new tasks."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright


@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_property_files_drive_the_exact_selected_2d_and_3d(language):
    evidence = Path("server_tests/evidence/property-preview")
    case = json.loads((evidence / "native-case.json").read_text())
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs") else None)
        page.goto(base + "#task=" + case["job_id"])
        before = page.request.get(base + "/api/jobs").json()
        table = page.locator(".properties-results .research-table")
        expect(table.locator("tbody tr")).to_have_count(2)
        for index, source in enumerate(case["sources"]):
            row = table.locator("tbody tr").nth(index)
            row.locator(".molecule-record").click()
            expect(row).to_have_attribute("aria-selected", "true")
            inspector = page.locator(".properties-results .result-inspector")
            expect(inspector.get_by_role(
                "heading", name=case["result"]["molecules"][index]["name"], exact=True
            )).to_be_visible()
            tab = inspector.get_by_role(
                "tab", name="三维结构" if zh else "3D structure", exact=True
            )
            tab.click()
            expect(tab).to_have_attribute("aria-selected", "true")
            expect(inspector.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
            )).to_be_enabled(timeout=45000)
            assert inspector.get_by_role("alert").count() == 0
            original = page.request.get(base + "/api/assets/" + source["id"])
            assert hashlib.sha256(original.body()).hexdigest() == source["sha256"]
            page.screenshot(path=str(evidence / f"{language}-file-{index}-3d.png"))
            inspector.get_by_role(
                "tab", name="二维结构" if zh else "2D structure", exact=True
            ).click()
            expect(inspector.locator(".molecule-image")).to_have_attribute(
                "data-drawing-state", "ready", timeout=45000
            )
            page.screenshot(path=str(evidence / f"{language}-file-{index}-2d.png"))
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not submissions, {"errors": errors, "submissions": submissions}
        browser.close()
