"""Verify compact Help and both desktop actions through the real workbench."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/desktop-help")
DRAFT = "CC(=O)Oc1ccccc1C(=O)O"


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1280, 720), ("zh", 1600, 900),
])
def test_help_opens_the_image_editor_without_resetting_another_tool(
    tmp_path, language, width, height,
):
    zh = language == "zh"
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with (
        platform(tmp_path / "state", EVIDENCE / f"server-{language}.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        writes = []

        def record(req):
            if req.method != "GET" and req.url.startswith(f"{base}/api/"):
                writes.append(req.url)

        page.context.on("request", record)
        page.goto(f"{base}/#view=utilities")
        tabs = page.locator(".utility-tabs")
        properties = tabs.get_by_role(
            "button", name="分子性质" if zh else "Molecular properties", exact=True,
        )
        image = tabs.get_by_role(
            "button", name="图片识别与编辑" if zh else "Image recognition & editor", exact=True,
        )
        properties.click()
        form = page.locator('[data-utility="properties"]')
        source = "粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)"
        form.get_by_role("radio", name=source, exact=True).check()
        draft = form.get_by_role("textbox", name="SMILES", exact=True)
        draft.fill(DRAFT)

        help_panel = page.locator(".help-workspace")
        settings = page.get_by_role("button", name="设置与帮助" if zh else "Settings and help")
        help_name = "使用帮助" if zh else "Getting started"

        def open_help():
            settings.click()
            page.get_by_role("menuitem", name=help_name, exact=True).click()
            expect(help_panel).to_be_visible()

        open_help()
        screenshot = help_panel.get_by_role(
            "button", name="从结构截图开始" if zh else "Use a structure screenshot",
        )
        research = help_panel.get_by_role(
            "button", name="选择研究任务" if zh else "Choose a research task",
        )
        expect(help_panel.get_by_role("listitem")).to_have_count(5)
        expect(screenshot).to_be_in_viewport()
        expect(research).to_be_in_viewport()
        bounds = help_panel.bounding_box()
        assert bounds and bounds["height"] <= 360
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=EVIDENCE / f"help-{language}-{width}.png")
        screenshot.press("Enter")
        expect(image).to_have_attribute("aria-pressed", "true")
        expect(page.locator('[data-utility="image"]')).to_be_visible()
        properties.click()
        expect(draft).to_have_value(DRAFT)

        open_help()
        research.click()
        expect(
            page.get_by_role("heading", name="全部能力" if zh else "All capabilities", exact=True),
        ).to_be_attached()
        expect(help_panel).to_have_count(0)
        assert not writes
        browser.close()
