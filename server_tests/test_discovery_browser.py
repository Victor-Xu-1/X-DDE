"""Actual public source UI flow; retrieval is explicit, no model inference is invoked."""

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_early_target_questionnaire_actual_sources_and_sequence_handoff():
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(base)
            page.get_by_role("button", name="靶点与研究材料", exact=True).click()
            scope = page.locator(".tool-center .questionnaire:visible")
            scope.get_by_role("textbox", name="靶点名称或基因符号").fill("KRAS")
            expect(scope.get_by_role("button", name="查找", exact=True)).to_be_disabled()
            scope.get_by_role("checkbox").check()
            scope.get_by_role("button", name="查找", exact=True).click()
            expect(scope.get_by_role("status").filter(has_text="找到")).to_be_visible(timeout=45000)
            scope.get_by_role("button", name="下一步", exact=True).click()
            scope.get_by_role("radio", name="KRAS", exact=True).click()
            scope.get_by_role("button", name="下一步", exact=True).click()
            scope.get_by_role("combobox", name="每类最多展示多少条？").select_option("10")
            jobs_before = page.request.get(base + "/api/jobs").json()
            scope.get_by_role("button", name="下一步", exact=True).click()
            assert len(page.request.get(base + "/api/jobs").json()) == len(jobs_before)
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                scope.scroll_into_view_if_needed()
                page.screenshot(
                    path=str(evidence / f"early-target-review-{width}.png"), full_page=True
                )
                assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
            page.set_viewport_size({"width": 1440, "height": 1000})
            scope.get_by_role("button", name="获取研究证据", exact=True).click()
            expect(page.get_by_text("可复用研究材料", exact=False)).to_be_visible(timeout=160000)
            results = page.locator(".discovery-results")
            expect(results.get_by_text("Open Targets: 已获取", exact=True)).to_be_visible()
            expect(results.get_by_text("UniProt: 已获取", exact=True)).to_be_visible()
            expect(results.get_by_text("ChEMBL: 已获取", exact=True)).to_be_visible()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                results.scroll_into_view_if_needed()
                page.screenshot(
                    path=str(evidence / f"early-target-results-{width}.png"), full_page=True
                )
                assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
            jobs = page.request.get(base + "/api/jobs").json()
            current = next(j for j in jobs if j["request"]["operation"] == "target_research")
            result = page.request.get(base + f"/api/jobs/{current['id']}/result").json()
            ref = result["materials"][0]["reference"]
            results.get_by_role("button", name="用这条序列预测结构", exact=True).click()
            expect(page.locator(".questionnaire:visible fieldset:not([hidden])")).to_be_visible()
            assert len(page.request.get(base + "/api/jobs").json()) == len(jobs)
            # Only draft handoff, no scientific task or inference is submitted.
            assert ref["sha256"] and ref["version_id"]
            page.reload()
            expect(page.get_by_role("navigation", name="主导航")).to_be_visible()
            assert errors == []
        finally:
            browser.close()
