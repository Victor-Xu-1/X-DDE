"""Verify native 2D review actions on narrow utility and guided task pages."""

from pathlib import Path
from xml.etree import ElementTree

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure

EVIDENCE = Path("outputs/utility-navigation")
DRAFT = "CC(=O)Nc1ccc(O)cc1"


def open_input(page, base, kind, zh):
    if kind == "utility":
        page.goto(base + "/#view=utilities")
        page.locator(".utility-tabs").get_by_role(
            "button", name="分子性质" if zh else "Molecular properties", exact=True
        ).click()
        panel = page.locator('[data-utility="properties"]')
    else:
        page.goto(base + "/#view=new&tool=properties")
        panel = page.get_by_role(
            "region", name="计算小分子性质" if zh else "Calculate molecular properties", exact=True
        )
    source = (
        "粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)"
    )
    panel.get_by_role("radio", name=source, exact=True).check()
    next_step = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
    if kind == "guided":
        next_step.click()
    panel.get_by_role("textbox", name="SMILES", exact=True).fill(DRAFT)
    if kind == "guided":
        next_step.click()
        next_step.click()
    return panel.locator(".molecular-input-review .molecule-image:visible")


@pytest.mark.parametrize("language", ["en", "zh"])
def test_utility_readiness_keeps_actions_in_the_first_screen(language):
    evidence = EVIDENCE / "utility-readiness" / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1110, "height": 600}, reduced_motion="reduce")
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        writes = []
        page.on("request", lambda req: writes.append(req.url)
                if req.method == "POST" and "/api/" in req.url else None)
        drawing = open_input(page, base, "utility", zh)
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
        panel = page.locator('[data-utility="properties"]')
        readiness = panel.locator(".single-page-readiness details")
        summary = readiness.locator("summary")
        expect(summary).to_have_text("工具尚未就绪" if zh else "Tool is not ready")
        expect(readiness).not_to_have_attribute("open", "")
        retry = readiness.get_by_role(
            "button", name="重新检查计算环境" if zh else "Check environment again", exact=True,
        )
        expect(retry).not_to_be_visible()
        submit = panel.locator('.questionnaire-actions button[type="submit"]')
        expect(submit).to_be_disabled()
        drawing.evaluate("""node => {
          for (let parent = node; parent; parent = parent.parentElement) {
            parent.scrollTo({top: 0, left: 0, behavior: 'instant'});
          }
          window.scrollTo({top: 0, left: 0, behavior: 'instant'});
        }""")
        stage, action = drawing.bounding_box(), submit.bounding_box()
        assert stage and action
        assert stage["x"] + stage["width"] < action["x"]
        assert stage["height"] >= 320 and stage["y"] + stage["height"] <= 601
        assert action["y"] >= 0 and action["y"] + action["height"] <= 601
        page.screenshot(path=evidence / "selected-structure.png")

        img = drawing.get_by_role("img")
        original = img.get_attribute("src")
        summary.click()
        expect(retry).to_be_enabled()
        with page.expect_response("**/api/capabilities/properties") as response:
            retry.click()
        assert response.value.ok
        expect(summary).to_have_text("工具尚未就绪" if zh else "Tool is not ready")
        expect(readiness).to_have_attribute("open", "")
        expect(img).to_have_attribute("src", original)
        expect(panel.get_by_role("textbox", name="SMILES", exact=True)).to_have_value(DRAFT)
        expect(submit).to_be_disabled()
        assert not writes
        browser.close()


@pytest.mark.parametrize(("kind", "language", "width", "height"), [
    ("utility", "en", 1110, 580),
    ("utility", "en", 320, 568),
    ("guided", "zh", 390, 620),
])
def test_2d_controls_keep_distinct_targets(kind, language, width, height):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    key = f"2d-controls-{kind}-{language}-{width}"
    with platform(Settings.from_env().state_dir, EVIDENCE / f"{key}.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome")
            page = browser.new_page(
                viewport={"width": width, "height": height}, reduced_motion="reduce"
            )
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', '{language}')"
            )
            writes = []
            page.on(
                "request",
                lambda req: writes.append(req.url)
                if req.method != "GET" and req.url.startswith(f"{base}/api/")
                else None,
            )
            drawing = open_input(page, base, kind, zh)
            canvas = drawing.locator(".figure-preview-sheet")
            toolbar = drawing.locator(".figure-view-toolbar")
            toolbar.scroll_into_view_if_needed()
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            zoom = toolbar.get_by_role(
                "button", name="放大预览" if zh else "Zoom in preview", exact=True
            )
            launcher = drawing.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            )
            sheet, bar, button = (locator.bounding_box() for locator in (canvas, toolbar, launcher))
            assert sheet and bar and button
            assert sheet["height"] >= 219
            assert sheet["y"] + sheet["height"] <= min(bar["y"], button["y"]) + 1
            assert bar["x"] + bar["width"] <= button["x"] + 1
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=EVIDENCE / f"{key}.png")

            zoom.click()
            expect(canvas).to_have_attribute("data-zoom", "2")
            zoomed = canvas.bounding_box()
            assert zoomed and abs(zoomed["height"] - sheet["height"]) <= 1
            toolbar.get_by_role(
                "button", name="适应窗口" if zh else "Fit preview", exact=True
            ).click()
            expect(canvas).to_have_attribute("data-zoom", "1")
            path = export_figure(page, launcher, EVIDENCE, key, language, "SVG")
            assert ElementTree.parse(path).findall(".//{http://www.w3.org/2000/svg}path")
            expect(launcher).to_be_focused()
            assert not writes
            browser.close()
