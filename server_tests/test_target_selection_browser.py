"""Source-bound ligand choices drive the real preview without submitting computation."""

import os
from pathlib import Path

from layout_browser_helpers import catalog, load_template
from playwright.sync_api import expect, sync_playwright


def test_ligand_choice_and_native_preview_share_the_same_source():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    errors, submissions = [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
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
        page.goto(os.environ["WB_BROWSER_URL"])
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        catalog(page)
        page.get_by_role("button", name="结合相互作用与三维标注", exact=True).and_(
            page.locator(".tool-card")
        ).click()
        load_template(page)
        page.get_by_role("button", name="下一步", exact=True).click()
        controls = page.get_by_role("region", name="研究目标选择", exact=True)
        analysis = controls.get_by_role("combobox", name="分析配体", exact=True)
        expect(analysis).to_be_enabled(timeout=30000)
        expect(analysis.get_by_role("option", name="JQ1 · A:1", exact=True)).to_have_count(1)
        center = page.get_by_role("combobox", name="中心配体", exact=True)
        contacts = page.locator(".interaction-summary")
        previous_contacts = None
        for width in (1440, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            analysis.select_option(label="JQ1 · A:1")
            expect(center.locator("option:checked")).to_have_text("A:JQ11")
            expect(contacts).to_contain_text("接触残基")
            if previous_contacts is not None:
                expect(contacts).not_to_have_text(previous_contacts)
            jq1_contacts = contacts.inner_text()
            expect(page.get_by_role("button", name="下一步", exact=True)).to_be_enabled()
            page.screenshot(path=str(evidence / f"{width}-target-selection-jq1.png"))
            analysis.select_option(label="DMS · A:171")
            expect(center.locator("option:checked")).to_have_text("A:DMS171")
            expect(contacts).not_to_have_text(jq1_contacts)
            previous_contacts = contacts.inner_text()
            resolution = page.get_by_role("combobox", name="三维图片清晰度", exact=True)
            capture = page.get_by_role("button", name="生成三维视图图片", exact=True)
            assert abs(resolution.bounding_box()["height"] - capture.bounding_box()["height"]) < 2
            assert resolution.bounding_box()["height"] <= 34
            expect(page.get_by_role("button", name="放大", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="全屏显示结构", exact=True)).to_be_visible()
            assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
            bounds = controls.bounding_box()
            preview = page.locator(".scientific-target-preview").bounding_box()
            if width == 1440:
                assert bounds["x"] + bounds["width"] <= preview["x"]
                assert abs(bounds["y"] - preview["y"]) < 2
            else:
                assert bounds["y"] + bounds["height"] <= preview["y"]
            page.screenshot(path=str(evidence / f"{width}-target-selection-dms.png"))
        assert not errors, errors
        assert not submissions, "A preview selection must never queue computation"
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()
