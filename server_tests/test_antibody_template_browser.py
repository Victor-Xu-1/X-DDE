"""Load the real STAT6-pathway sequence template without running scientific inference."""

import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import open_navigation, settings


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_numbering_template_source_and_blank_reset(language, width):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    evidence = Path("server_tests/evidence/antibody-template")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        if zh:
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        open_navigation(page, language).get_by_role(
            "button", name="生物药研究" if zh else "Biologics research", exact=True
        ).click()
        page.get_by_role("combobox", name="研究任务" if zh else "Research task").select_option(
            label="抗体编号与CDR标注" if zh else "Antibody numbering and CDR annotation"
        )
        with page.expect_response(
            lambda response: "/api/examples/antibody.number/prepare" in response.url
            and response.request.method == "POST"
        ) as preparing:
            page.get_by_role("button", name="使用这个模板" if zh else "Use this template").click()
        prepared = preparing.value.json()
        source = prepared["request"]["sequences"]
        assert source == prepared["objects"]["variable_domains"]["reference"]
        expect(page.get_by_role("button", name="新建空白任务" if zh else "New blank task")).to_be_visible()
        for _ in range(3):
            page.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        expect(page.get_by_text(source["version_id"], exact=True)).to_be_visible()
        expect(page.get_by_text("IMGT · ANARCII 2.0.8 · accuracy", exact=True)).to_be_visible()
        page.screenshot(path=evidence / f"review-{language}.png", full_page=True)
        page.get_by_role("button", name="新建空白任务" if zh else "New blank task").click()
        expect(page.get_by_role("radio", name="粘贴序列" if zh else "Paste sequences")).to_be_checked()
        expect(page.get_by_role("button", name="下一步" if zh else "Next", exact=True)).to_be_disabled()
        assert before == page.request.get(base + "/api/jobs").json()
        assert not errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        browser.close()
