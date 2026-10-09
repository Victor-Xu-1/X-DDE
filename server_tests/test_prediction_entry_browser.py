"""Fresh prediction entry and multilingual material guidance; no preparation or inference."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_fresh_prediction_has_no_unavailable_results_strip_or_toy_inputs(tmp_path, language, width):
    evidence = Path("outputs/prediction-entry")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(tmp_path / "state", evidence / f"{language}-{width}.log") as base:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": 1000})
            if language == "zh":
                page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
            errors, submissions = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: (
                    submissions.append(request.url)
                    if request.method == "POST" and request.url.endswith("/api/jobs")
                    else None
                ),
            )
            page.goto(base)
            open_navigation(page, language)
            page.get_by_role(
                "button",
                name="Structure prediction" if language == "en" else "结构预测",
                exact=True,
            ).click()
            expect(page.locator(".prediction-workspace")).to_be_visible()
            expect(page.locator(".prediction-workspace .workspace-mode")).to_be_hidden()
            expect(
                page.get_by_role(
                    "button", name="Next" if language == "en" else "下一步", exact=True
                )
            ).to_be_enabled()
            page.screenshot(path=str(evidence / f"{language}-{width}-study.png"), full_page=True)
            page.get_by_role(
                "button", name="Next" if language == "en" else "下一步", exact=True
            ).click()
            protein = page.locator("#molecule-0")
            ligand = page.locator("#molecule-1")
            expect(protein).to_have_value("")
            expect(ligand).to_have_value("")
            expect(protein).to_have_attribute(
                "placeholder",
                "Paste the target protein sequence or one FASTA record"
                if language == "en"
                else "粘贴靶蛋白序列或单条 FASTA",
            )
            expect(ligand).to_have_attribute(
                "placeholder",
                "Paste SMILES or a CCD_ component identifier"
                if language == "en"
                else "粘贴 SMILES 或 CCD_组分编号",
            )
            page.get_by_role(
                "button",
                name="Small molecule / ligand input help"
                if language == "en"
                else "小分子 / 配体输入说明",
                exact=True,
            ).click()
            assert "CCO" not in page.locator("body").inner_text()
            assert "ethanol" not in page.locator("body").inner_text().lower()
            assert "乙醇" not in page.locator("body").inner_text()
            page.screenshot(
                path=str(evidence / f"{language}-{width}-input-help.png"), full_page=True
            )
            page.keyboard.press("Escape")
            page.keyboard.press("Tab")
            page.mouse.move(0, 0)
            expect(page.get_by_role("tooltip")).to_be_hidden()
            active = page.locator(".prediction-workspace .questionnaire > fieldset:not([hidden])")
            expect(active).to_have_css("transform", "none")
            expect(active).to_have_css("opacity", "1")
            expect(ligand).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            # Capture the clean page from its top; retain the help-open image separately.
            page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
            page.screenshot(
                path=str(evidence / f"{language}-{width}-materials.png"), full_page=True
            )
            assert (
                not errors and not submissions and not page.request.get(base + "/api/jobs").json()
            )
            browser.close()
