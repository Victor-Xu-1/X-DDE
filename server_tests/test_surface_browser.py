"""Actual native case presentation and fresh questionnaire; no scientific browser dispatch."""

import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_surface_native_3d_table_download_and_guided_entry():
    evidence = Path("server_tests/evidence/surface")
    session = json.loads((evidence / "session.json").read_text())
    result = json.loads((evidence / "result.json").read_text())
    base = os.environ["WB_SURFACE_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        errors = []
        submitted = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "request",
            lambda req: (
                submitted.append(req.url)
                if req.method == "POST" and req.url.split("?")[0].endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base + "/#task=" + session["job_id"])
        expect(page.get_by_role("heading", name="区域暴露与埋藏", exact=True)).to_have_text(
            "区域暴露与埋藏"
        )
        expect(page.locator(".surface-summary")).to_contain_text(f"{result['assembly_area']:.1f}")
        expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(timeout=30000)
        frame = page.frame_locator('iframe[title="可交互分子结构"]')
        expect(frame.locator("canvas").first).to_be_visible(timeout=30000)
        page.get_by_role("button", name="A:JQ1 1", exact=True).first.click()
        for width in (1440, 390):
            page.set_viewport_size({"width": width, "height": 1050})
            assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
            page.screenshot(path=str(evidence / f"native-result-{width}.png"), full_page=True)
        with page.expect_download() as pending:
            page.get_by_role("link", name="下载原子面积", exact=True).click()
        download = pending.value
        download.save_as(evidence / "browser-atoms.csv")
        assert (evidence / "browser-atoms.csv").read_bytes() == (
            evidence / "atoms.csv"
        ).read_bytes()
        page.set_viewport_size({"width": 1440, "height": 1050})
        page.get_by_role("navigation", name="主导航").get_by_role(
            "button", name="口袋与对接", exact=True
        ).click()
        page.get_by_role("combobox", name="研究任务", exact=True).select_option(
            "biopython.exposure"
        )
        expect(page.get_by_role("radio", name="上传新文件", exact=True)).to_be_checked()
        expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
        page.locator('input[type="file"]').first.set_input_files(evidence / "prepared-case.pdb")
        expect(page.get_by_role("button", name="下一步", exact=True)).to_be_enabled()
        page.get_by_role("button", name="下一步", exact=True).click()
        expect(page.locator(".questionnaire>fieldset:visible")).to_have_count(1)
        expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
        choices = page.get_by_role("combobox", name="选择配体或残基", exact=True)
        expect(choices.locator("option").filter(has_text="A:JQ1 1")).to_have_count(1, timeout=30000)
        option = choices.locator("option").filter(has_text="A:JQ1 1").get_attribute("value")
        choices.select_option(option)
        expect(page.get_by_role("button", name="移除 A:JQ1 1", exact=True)).to_be_visible()
        page.screenshot(path=str(evidence / "region-selection-desktop.png"), full_page=True)
        page.get_by_role("button", name="下一步", exact=True).click()
        expect(page.get_by_role("radio", name="标准（推荐）", exact=True)).to_be_checked()
        page.get_by_role("button", name="下一步", exact=True).click()
        expect(page.get_by_role("button", name="计算暴露与埋藏", exact=True)).to_be_visible()
        page.screenshot(path=str(evidence / "submission-review-desktop.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 1050})
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        page.screenshot(path=str(evidence / "submission-review-mobile.png"), full_page=True)
        page.get_by_role("button", name="使用此模板", exact=True).click()
        expect(page.get_by_role("button", name="下一步", exact=True)).to_be_enabled()
        page.get_by_role("button", name="示例结果", exact=True).click()
        expect(page.locator(".module-template .surface-results")).to_be_visible(timeout=30000)
        page.screenshot(path=str(evidence / "fixed-module-example-mobile.png"), full_page=True)
        assert not submitted and not errors
        browser.close()
