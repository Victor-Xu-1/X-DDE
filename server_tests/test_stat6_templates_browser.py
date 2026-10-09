"""Inspect the changed study-template path; never submit a scientific task."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_navigation_shell_browser import open_navigation, settings

EVIDENCE = Path("server_tests/evidence/stat6")


def catalog(page, language):
    nav = open_navigation(page, language)
    nav.get_by_role(
        "button", name="全部能力" if language == "zh" else "All capabilities", exact=True
    ).click()
    for summary in page.locator(".capability-additional > summary").all():
        summary.click()


def test_each_visible_module_loads_stat6_inputs_without_task_spam():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"]
    rows, errors, submissions = [], [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(base)
        expect(page.locator("html")).to_have_attribute("lang", "en")
        before = page.request.get(base + "/api/jobs").json()
        selected = [
            spec for key, spec in CAPABILITIES.items() if spec.frontend_form and key != "resources"
        ]
        for spec in selected:
            catalog(page, "en")
            page.locator(".tool-card").get_by_role(
                "heading", name=spec.label[1], exact=True
            ).locator("..").click()
            toolbar = page.locator(".module-template:visible")
            expect(toolbar.locator(".example-case-name")).to_contain_text("STAT6")
            expect(toolbar.get_by_role("button", name="Example results", exact=True)).to_have_count(
                0
            )
            toolbar.get_by_role("button", name="Use this template", exact=True).click()
            expect(toolbar.get_by_role("button", name="New blank task", exact=True)).to_be_visible(
                timeout=30000
            )
            assert page.locator("main .questionnaire > fieldset:visible").count() <= 1
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            main = page.locator("main").inner_text()
            assert "BRD4–JQ1" not in main and "Trastuzumab–HER2" not in main
            if spec.id in {
                "p2rank.detect",
                "deepternary.model",
                "boltz.predict",
                "openfe.rbfe",
                "del.analyze",
            }:
                page.screenshot(path=EVIDENCE / (spec.id + "-template-en.png"))
            rows.append({"module": spec.id, "case": "stat6-defined-molecules", "loaded": True})
        assert before == page.request.get(base + "/api/jobs").json()
        assert not errors, errors
        assert not submissions, submissions
        browser.close()
    (EVIDENCE / "template-coverage.json").write_text(json.dumps(rows, indent=2))


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_real_2d_3d_inputs_and_downloads_are_reference_materials(language, width):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.goto(base)
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["admet.predict"].label[language == "en"], exact=True
        ).locator("..").click()
        page.get_by_role(
            "button",
            name="查看研究材料" if language == "zh" else "Preview study inputs",
            exact=True,
        ).click()
        preview = page.locator(".study-input-preview")
        expect(preview).to_be_visible()
        expect(preview.locator(".study-geometry-note")).to_contain_text("MMFF94s")
        expect(preview.locator(".viewer-message")).to_have_count(0, timeout=45000)
        page.screenshot(path=EVIDENCE / f"{width}-small-molecule-3d-{language}.png")
        preview.get_by_role("button", name="2D", exact=True).click()
        expect(preview.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=45000
        )
        page.screenshot(path=EVIDENCE / f"{width}-small-molecule-2d-{language}.png")
        preview.get_by_role(
            "button", name="指定 PROTAC" if language == "zh" else "Study PROTAC", exact=True
        ).click()
        expect(preview.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=45000
        )
        url = preview.get_by_role(
            "link", name="下载原始材料" if language == "zh" else "Download source input", exact=True
        ).get_attribute("href")
        response = page.request.get(base + url)
        assert response.ok and "STAT6-user-PROTAC" in response.text()
        preview.get_by_role("button", name="3D", exact=True).click()
        expect(preview.locator(".viewer-message")).to_have_count(0, timeout=45000)
        page.screenshot(path=EVIDENCE / f"{width}-protac-3d-{language}.png")
        preview.get_by_role(
            "button",
            name="STAT6 实验参考" if language == "zh" else "STAT6 experimental reference",
            exact=True,
        ).click()
        expect(preview.locator(".viewer-message")).to_have_count(0, timeout=45000)
        page.screenshot(path=EVIDENCE / f"{width}-stat6-experimental-{language}.png")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert page.request.get(base + "/api/jobs").json() == []
        browser.close()
