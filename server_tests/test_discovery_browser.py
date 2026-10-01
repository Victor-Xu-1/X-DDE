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


def test_reference_import_questionnaire_actual_archive_preview_and_persisted_version():
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
            page.get_by_role("navigation", name="主导航").get_by_role(
                "button", name="全部能力", exact=True
            ).click()
            page.get_by_role("button", name="导入参考结构与化合物", exact=False).click()
            scope = page.locator(".tool-center .questionnaire:visible")
            scope.get_by_role("button", name="下一步", exact=True).click()
            scope.get_by_role("textbox", name="PDB 编号").fill("1CRN")
            scope.get_by_role("button", name="下一步", exact=True).click()
            scope.get_by_role("button", name="上一步", exact=True).click()
            expect(scope.get_by_role("textbox", name="PDB 编号")).to_have_value("1CRN")
            scope.get_by_role("button", name="下一步", exact=True).click()
            before = len(page.request.get(base + "/api/jobs").json())
            scope.get_by_role("button", name="下一步", exact=True).click()
            assert len(page.request.get(base + "/api/jobs").json()) == before
            expect(scope.get_by_role("button", name="导入研究材料", exact=True)).to_be_disabled()
            scope.get_by_role("checkbox").check()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                scope.scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / f"archive-review-{width}.png"), full_page=True)
                assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
            page.set_viewport_size({"width": 1440, "height": 1000})
            scope.get_by_role("button", name="导入研究材料", exact=True).click()
            results = page.locator(".discovery-results")
            expect(results.get_by_role("link", name="下载原始材料")).to_be_visible(timeout=160000)
            job = next(
                j
                for j in page.request.get(base + "/api/jobs").json()
                if j["request"]["operation"] == "reference_import"
            )
            report = page.request.get(base + f"/api/jobs/{job['id']}/result").json()
            assert (
                report["reference"]["version_id"]
                and report["reference"]["sha256"] == report["sha256"]
            )
            expect(results.locator("iframe")).to_be_visible()
            expect(results.get_by_role("button", name="回到全局", exact=True).first).to_be_visible(
                timeout=30000
            )
            page.screenshot(path=str(evidence / "archive-structure-preview.png"), full_page=True)
            jobs_before = len(page.request.get(base + "/api/jobs").json())
            results.get_by_role("button", name="准备研究结构", exact=True).click()
            preparation = page.locator(".questionnaire:visible")
            preparation.get_by_role("button", name="下一步", exact=True).click()
            preparation.get_by_role("radio", name="在预览中选择链", exact=True).click()
            expect(preparation.get_by_role("checkbox", name="链 A", exact=True)).to_be_visible(
                timeout=30000
            )
            preparation.get_by_role("checkbox", name="链 A", exact=True).check()
            preparation.get_by_role("button", name="下一步", exact=True).click()
            preparation.get_by_role("button", name="上一步", exact=True).click()
            expect(preparation.get_by_role("checkbox", name="链 A", exact=True)).to_be_checked()
            preparation.get_by_role("button", name="下一步", exact=True).click()
            preparation.get_by_role("button", name="下一步", exact=True).click()
            assert len(page.request.get(base + "/api/jobs").json()) == jobs_before
            # Isolated browser server has no Bio image; input remains usable, submit is disabled.
            expect(
                preparation.get_by_role("button", name="保存准备后的结构", exact=True)
            ).to_be_disabled()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                preparation.scroll_into_view_if_needed()
                page.screenshot(
                    path=str(evidence / f"structure-preparation-review-{width}.png"), full_page=True
                )
                assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
            page.reload()
            expect(
                page.locator(".discovery-results").get_by_role("link", name="下载原始材料")
            ).to_be_visible()
            assert errors == []
        finally:
            browser.close()
