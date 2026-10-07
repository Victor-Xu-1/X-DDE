"""Real browser decisions reuse scientific questionnaires; no model inference or queued jobs."""

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_binding_material_routes_and_structural_prerequisites():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
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
        page.goto(os.environ["WB_BROWSER_URL"])
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()

        def open_guide():
            page.get_by_role("button", name="口袋与对接", exact=True).click()
            page.get_by_role("button", name="按已有材料开始", exact=True).click()
            dialog = page.get_by_role("dialog", name="您现在有哪些材料？", exact=True)
            expect(dialog).to_be_visible()
            expect(dialog.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            return dialog

        dialog = open_guide()
        expect(dialog.get_by_role("heading")).to_be_focused()
        page.screenshot(path=str(evidence / "binding-entry-desktop.png"))
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(page.get_by_role("button", name="按已有材料开始", exact=True)).to_be_focused()
        for label, tool in [
            ("已有参考复合物", "gnina.score"),
            ("结构和位点已知", "gnina.dock"),
            ("有结构，位点未知", "p2rank.detect"),
        ]:
            dialog = open_guide()
            dialog.get_by_role("radio", name=label, exact=True).check()
            dialog.get_by_role("button", name="下一步", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            expect(page.get_by_role("combobox", name="研究任务", exact=True)).to_have_value(tool)
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
        for label, tool in [
            ("只有蛋白序列", "predict"),
            ("已有需要检查的结构", "biopython.prepare"),
        ]:
            dialog = open_guide()
            dialog.get_by_role("radio", name="结构资料不足", exact=True).check()
            dialog.get_by_role("button", name="下一步", exact=True).click()
            dialog = page.get_by_role("dialog", name="目前可以提供什么？", exact=True)
            expect(dialog.get_by_role("radio")).to_have_count(2)
            expect(dialog.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            dialog.get_by_role("radio", name=label, exact=True).check()
            page.screenshot(path=str(evidence / ("binding-prerequisite-" + tool + ".png")))
            dialog.get_by_role("button", name="下一步", exact=True).click()
            expect(page.get_by_role("combobox", name="研究任务", exact=True)).to_have_value(tool)
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
        page.set_viewport_size({"width": 390, "height": 900})
        dialog = open_guide()
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        assert dialog.evaluate("e=>e.scrollWidth<=e.clientWidth+1")
        page.screenshot(path=str(evidence / "binding-entry-mobile.png"))
        dialog.get_by_role("radio", name="结构资料不足", exact=True).check()
        dialog.get_by_role("button", name="下一步", exact=True).click()
        page.screenshot(path=str(evidence / "binding-prerequisite-mobile.png"))
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        assert not errors and not submitted
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()
