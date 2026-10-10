"""Walk changed molecular-input questionnaires without launching scientific work."""

import base64
import json
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


@pytest.mark.parametrize("language", ["en", "zh"])
def test_real_browser_readiness_deadline_preserves_input_without_claiming_missing_software(
    language,
):
    """Hold only the availability transport; never mock any scientific result."""
    zh = language == "zh"
    evidence = Path("outputs/publication-browser/task-clarity/readiness")
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / (language + ".log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        held, errors, submissions = [], [], []
        page.route("**/api/capabilities/properties", lambda route: held.append(route))
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
        card = page.locator('button[data-capability="properties"]').first
        expect(card).to_be_visible(timeout=30000)
        card.click()
        form = page.get_by_role(
            "region", name="计算小分子性质" if zh else "Calculate molecular properties", exact=True
        ).locator(".questionnaire")
        page.get_by_role(
            "radio",
            name="粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)",
            exact=True,
        ).check()
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        next_step.click()
        smiles = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"
        page.get_by_role("textbox", name="SMILES", exact=True).fill(smiles)
        next_step.click()
        next_step.click()
        expect(page.get_by_role("status")).to_contain_text(
            "正在确认计算环境" if zh else "Checking the calculation environment"
        )
        submit = page.get_by_role(
            "button", name="计算性质" if zh else "Calculate properties", exact=True
        )
        expect(submit).to_be_disabled()
        expect(page.locator(".molecular-input-review .molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=45000
        )
        expect(page.get_by_role("alert")).to_contain_text(
            "暂时无法确认计算环境" if zh else "The calculation environment could not be checked",
            timeout=20000,
        )
        expect(submit).to_be_disabled()
        expect(page.get_by_label("SMILES", exact=True)).to_have_value(smiles)
        assert (
            "RDKit 性质计算环境尚未就绪" if zh else "Configure molecular-property tools"
        ) not in form.inner_text()
        page.screenshot(path=str(evidence / (language + "-bounded-failure.png")))
        assert held and not errors and not submissions
        assert jobs == page.request.get(base + "/api/jobs").json()
        (evidence / (language + "-receipt.json")).write_text(
            json.dumps(
                {
                    "transport_held": True,
                    "input_preserved": True,
                    "scientific_submissions": 0,
                    "browser_errors": errors,
                    "source": "STAT6 user-provided warhead",
                },
                indent=2,
            )
        )
        browser.close()
