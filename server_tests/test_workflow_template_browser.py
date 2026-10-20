"""Real retained study recipes load through the questionnaire without starting inference."""

import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_stat6_templates_browser import catalog


@pytest.mark.parametrize("language", ["en", "zh"])
def test_workflow_template_is_guided_measured_and_does_not_submit_on_load(language):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = Path("outputs/workflow-template") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["workflows"].label[0 if zh else 1], exact=True
        ).locator("..").click()
        page.locator(".module-template:visible").get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
        expect(
            page.get_by_role(
                "combobox",
                name="如何准备研究计划？" if zh else "How should the research plan be prepared?",
            )
        ).to_have_value("case", timeout=30000)
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_step).to_be_enabled()
        next_step.click()
        expect(
            page.get_by_text(
                "· 必须通过指定实测检查" if zh else "· Required measured checks must pass",
                exact=True,
            )
        ).to_be_visible()
        assert page.locator("main .questionnaire > fieldset:visible").count() == 1
        page.screenshot(path=evidence / "measured-steps.png", full_page=True)
        assert page.request.get(base + "/api/jobs").json() == before
        browser.close()
