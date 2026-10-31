"""Prepared native-numbered inputs in the actual questionnaire; no model submission."""

import hashlib
import json
import os
from dataclasses import replace
from pathlib import Path

import pytest
from antibody_cdr_case import numbering_case
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_stat6_templates_browser import catalog


@pytest.mark.parametrize("tool", ["fold", "epitope"])
@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_numbered_interface_template_loads_reviews_and_resets_without_submitting(
    tool, language, width
):
    initial = Settings.from_env()
    assert initial.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    settings = replace(initial, state_dir=initial.state_dir / f"{tool}-{language}")
    numbering_case(settings)
    evidence = Path("outputs/antibody-cdr") / f"{tool}-{language}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.split("?")[0].endswith("/api/jobs")
                else None
            ),
        )
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES[tool].label[0 if zh else 1], exact=True
        ).locator("..").click()
        toolbar = page.locator(".module-template:visible")
        with page.expect_response(
            lambda response: (
                "/api/examples/" + tool + "/prepare" in response.url
                and response.request.method == "POST"
            )
        ) as response:
            toolbar.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        prepared = response.value.json()
        ref = prepared["objects"]["antibody_cdr_inputs"]["reference"]
        assert ref in prepared["request"]["scientific_inputs"]
        assert not prepared["study"]["required_materials"]
        download = page.request.get(base + "/api/assets/" + ref["asset_id"])
        assert download.ok and hashlib.sha256(download.body()).hexdigest() == ref["sha256"]
        annotation = json.loads(prepared["objects"]["antibody_cdr_inputs"]["notes"])
        assert annotation["positions"] == "zero_based_sequence_order"
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_step).to_be_enabled(timeout=30000)
        next_step.click()
        expect(next_step).to_be_enabled()
        page.screenshot(path=evidence / "regions.png", full_page=True, animations="disabled")
        next_step.click()
        if tool == "fold":
            page.get_by_role(
                "checkbox", name="允许向配置" if zh else "Allow sending", exact=False
            ).check()
        next_step.click()
        expect(page.locator(".questionnaire-review")).to_be_visible()
        if tool == "fold":
            expect(
                page.get_by_role("table", name="候选链 1" if zh else "Candidate chains 1")
            ).to_contain_text("125")
            expect(
                page.get_by_role("table", name="候选链 1" if zh else "Candidate chains 1")
            ).to_contain_text("112")
        page.screenshot(path=evidence / "review.png", full_page=True, animations="disabled")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        toolbar.get_by_role(
            "button", name="新建空白任务" if zh else "New blank task", exact=True
        ).click()
        expect(next_step).to_be_disabled()
        assert before == page.request.get(base + "/api/jobs").json()
        assert not submissions and not errors, (submissions, errors)
        (evidence / "verified.json").write_text(
            json.dumps(
                {
                    "tool": tool,
                    "language": language,
                    "annotation": ref,
                    "prepared_native_regions": prepared["request"]["payload"].get("cdr_regions")
                    or prepared["request"]["payload"]["options"]["cdr_regions"],
                    "model_tasks_created": 0,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
