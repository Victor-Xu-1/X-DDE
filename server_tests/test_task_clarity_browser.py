"""Walk changed molecular-input questionnaires without launching scientific work."""

import base64
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("capability", ["properties", "admet.predict"])
@pytest.mark.parametrize("width", [1440, 390])
def test_molecular_templates_have_relevant_steps_and_exact_file_review(capability, language, width):
    zh = language == "zh"
    evidence = Path("outputs/publication-browser/task-clarity") / capability
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / (language + ".log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        card = page.locator(f'button[data-capability="{capability}"]').first
        expect(card).to_have_count(1, timeout=30000)
        if not card.is_visible():
            card.locator("xpath=ancestor::details").locator("summary").click()
        card.click()
        page.get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
        expect(
            page.get_by_role("button", name="新建空白任务" if zh else "New blank task", exact=True)
        ).to_be_visible(timeout=45000)
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        for step in range(4):
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
            if step == 1:
                guidance = page.get_by_role("note").inner_text()
                assert "选择研究区域" not in guidance and "select a research region" not in guidance
            if step == 3:
                drawing = page.locator(".molecular-input-review .molecule-image")
                expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
                expect(drawing.get_by_role("img")).to_be_visible()
                expect(page.locator(".molecular-input-review figcaption")).to_contain_text(
                    "首个分子" if zh else "First molecule"
                )
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                svg = drawing.get_by_role("img").get_attribute("src")
                assert svg.startswith("data:image/svg+xml;base64,")
                (evidence / f"{language}-{width}-input.svg").write_bytes(
                    base64.b64decode(svg.split(",", 1)[1])
                )
            page.screenshot(path=str(evidence / f"{language}-{width}-step{step + 1}.png"))
            if step < 3:
                expect(next_step).to_be_enabled(timeout=30000)
                next_step.click()
        review = page.locator(".questionnaire > fieldset:visible")
        expect(review).to_contain_text("STAT6-user-warhead.sdf")
        assert (
            "0 text structures" not in review.inner_text()
            and "0条文字结构" not in review.inner_text()
        )
        page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        next_step.click()
        expect(review).to_contain_text("STAT6-user-warhead.sdf")
        assert jobs == page.request.get(base + "/api/jobs").json()
        assert not errors and not submissions
        browser.close()
