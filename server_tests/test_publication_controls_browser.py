"""Shared figure and selection controls on actual retained results; no computation."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure
from server_tests.publication_viewing_helpers import inspect_zoom
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("outputs/publication-browser/controls")
STAT6_SMILES = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


def expect_indicator(page, track):
    expect(track.locator(".active-control-indicator")).to_be_visible()
    page.wait_for_function(
        """track => {
          const selector = ':scope > button[aria-selected="true"], ' +
            ':scope > button[aria-current="step"], :scope > button[aria-pressed="true"]';
          const selected = track?.querySelector(selector);
          const line = track?.querySelector('.active-control-indicator');
          if (!selected || !line) return false;
          const a = selected.getBoundingClientRect(), b = line.getBoundingClientRect();
          return Math.abs(a.left-b.left) < 1.5 && Math.abs(a.width-b.width) < 1.5 &&
            Math.abs(a.bottom-b.bottom) < 1.5;
        }""",
        arg=track.element_handle(),
        timeout=5000,
    )


@pytest.mark.parametrize("language", ["en", "zh"])
def test_ketcher_preview_matches_download_and_mobile_settings(language):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, EVIDENCE / (language + "-drawings.log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        example = page.request.get(base + "/api/examples/properties?profile=archive").json()
        identifier = example["pin"]["job_id"]
        result_url = base + "/api/jobs/" + identifier + "/result"
        result = page.request.get(result_url).json()
        page.goto(base + "/#task=" + identifier)
        search = page.get_by_role(
            "searchbox", name="搜索任务" if language == "zh" else "Search tasks", exact=True
        )
        search.fill("STAT6")
        inspector = page.locator(".properties-results .result-inspector")
        drawing = inspector.locator(".molecule-image:not(.is-thumbnail)").first
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
        expect(search).to_be_focused()
        expect(search).to_have_value("STAT6")
        search.fill("")
        trigger = drawing.get_by_role(
            "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓", exact=True
        )
        figure = export_figure(
            page,
            trigger,
            EVIDENCE,
            language + "-ketcher",
            language,
            "SVG",
            inspect=lambda dialog: inspect_zoom(
                page, dialog, EVIDENCE, language + "-ketcher", language
            ),
        )
        import xml.etree.ElementTree as ET

        root = ET.fromstring(figure.read_bytes())
        assert root.attrib["width"] == "89mm" and root.findall(
            ".//{http://www.w3.org/2000/svg}path"
        )
        page.set_viewport_size({"width": 390, "height": 1000})
        page.emulate_media(reduced_motion="reduce")
        trigger.click()
        dialog = page.get_by_role("dialog")
        width = dialog.get_by_role(
            "combobox", name="版面宽度" if language == "zh" else "Figure width", exact=True
        )
        width.select_option("183")
        width.select_option("89")
        dialog.get_by_role(
            "combobox", name="印刷字号" if language == "zh" else "Printed type size", exact=True
        ).select_option("9")
        dialog.get_by_role(
            "checkbox", name="透明背景" if language == "zh" else "Transparent background"
        ).check()
        page.wait_for_function(
            """() => {
              const figure=document.querySelector('dialog .figure-preview');
              return figure?.getAttribute('aria-busy') === 'false';
            }""",
            timeout=45000,
        )
        if dialog.get_by_role("alert").count():
            # Follow only the explicit layout choice; a renderer failure must still fail.
            expect(dialog.get_by_role("alert")).to_contain_text(
                "请选择双栏" if language == "zh" else "Choose double column"
            )
            expect(
                dialog.get_by_role(
                    "button", name="导出 SVG" if language == "zh" else "Export SVG", exact=True
                )
            ).to_be_disabled()
            page.screenshot(path=EVIDENCE / (language + "-mobile-layout-choice.png"))
            width.select_option("183")
        expect(dialog.locator(".figure-preview-sheet img")).to_be_visible(timeout=45000)
        expect(
            dialog.get_by_role(
                "button", name="导出 SVG" if language == "zh" else "Export SVG", exact=True
            )
        ).to_be_enabled(timeout=45000)
        assert (
            dialog.locator(".figure-preview-sheet").evaluate(
                "node => getComputedStyle(node.querySelector('img')).animationName"
            )
            == "none"
        )
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        inspect_zoom(page, dialog, EVIDENCE, language + "-mobile-figure", language)
        page.screenshot(path=EVIDENCE / (language + "-mobile-native-preview.png"))
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()
        assert page.request.get(result_url).json() == result
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
def test_shared_steps_models_and_result_tabs_retain_user_choices(language):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, EVIDENCE / (language + "-controls.log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, submitted = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submitted.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="全部能力" if zh else "All capabilities", exact=True
        ).click()
        card = page.locator('button[data-capability="properties"]').first
        if not card.is_visible():
            card.locator("xpath=ancestor::details").locator("summary").click()
        card.click()
        form = page.locator(".questionnaire:visible")
        form.get_by_role(
            "radio",
            name="粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)",
            exact=True,
        ).check()
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        form.get_by_role("textbox", name="SMILES", exact=True).fill(STAT6_SMILES)
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        track = form.locator(".questionnaire-steps")
        expect_indicator(page, track)
        track.get_by_role("button", name="步骤 2:" if zh else "Step 2:").click()
        expect(form.get_by_role("textbox", name="SMILES", exact=True)).to_have_value(STAT6_SMILES)
        expect_indicator(page, track)
        open_navigation(page, language).get_by_role(
            "button", name="动力学与 FEP" if zh else "Dynamics and FEP", exact=True
        ).click()
        methods = page.locator(".task-model-switch:visible")
        methods.get_by_role("button", name="GROMACS", exact=False).click()
        expect(methods.get_by_role("button", name="GROMACS", exact=False)).to_have_attribute(
            "aria-pressed", "true"
        )
        expect_indicator(page, methods)
        example = page.request.get(base + "/api/examples/admet.predict?profile=archive").json()
        page.goto(base + "/#task=" + example["pin"]["job_id"])
        tabs = page.get_by_role("tablist", name="候选视图" if zh else "Candidate views", exact=True)
        tabs.get_by_role("tab", name="性质分布" if zh else "Property landscape", exact=True).click()
        expect(
            page.get_by_role(
                "tabpanel", name="性质分布" if zh else "Property landscape", exact=True
            )
        ).to_be_visible()
        expect_indicator(page, tabs)
        chart = page.locator(".research-plot:visible").first
        export_figure(
            page,
            chart.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ),
            EVIDENCE,
            language + "-native-property-plot",
            language,
            "SVG",
        )
        page.emulate_media(reduced_motion="reduce")
        tabs.get_by_role("tab").first.click()
        expect_indicator(page, tabs)
        assert (
            tabs.locator(".active-control-indicator").evaluate(
                "node => getComputedStyle(node).transitionDuration"
            )
            == "0s"
        )
        page.screenshot(path=EVIDENCE / (language + "-result-tabs.png"))
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not submitted, (errors, submitted)
        browser.close()
