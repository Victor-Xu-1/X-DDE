"""Actual SVG/3D/plot/sequence interactions through frozen public case outputs."""

import json
import os
import sqlite3
from pathlib import Path

from layout_browser_helpers import catalog
from playwright.sync_api import expect, sync_playwright


def test_real_structures_tables_and_sequences():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(Path(os.environ["WB_STATE_DIR"]) / "jobs.sqlite3") as db:
        before = db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()
    steps, errors, submitted = [], [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
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

        def result(name):
            catalog(page)
            page.get_by_role("button", name=name, exact=True).click()
            page.locator(".module-template:visible").get_by_role(
                "button", name="示例结果", exact=True
            ).click()
            expect(page.get_by_text("正在读取结果…", exact=True)).not_to_be_visible(timeout=30000)

        def record(name):
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=str(evidence / ("visual-" + name + ".png")))
            steps.append(name)

        try:
            result("导入参考结构与化合物")
            expect(page.get_by_role("heading", name="3MXF", exact=True)).to_be_visible()
            expect(page.get_by_role("link", name="下载原始材料", exact=True)).to_be_visible()
            record("verified-reference-import")
            result("计算小分子性质")
            expect(page.locator(".molecule-image img").first).to_be_visible(timeout=90000)
            page.wait_for_function(
                """() => {
                    const image = document.querySelector('.molecule-image img');
                    return image && image.complete && image.naturalWidth > 0;
                }""",
                timeout=30000,
            )
            record("molecule-2d-table")
            result("性质与早期安全性预测")
            expect(page.locator(".admet-results .research-table")).to_be_visible()
            page.locator(".admet-results .molecule-record").last.click()
            expect(page.locator(".result-inspector .viewer-panel iframe")).to_be_visible(
                timeout=30000
            )
            record("admet-linked-preview")
            result("发现多个候选口袋")
            expect(page.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
                timeout=30000
            )
            page.get_by_role("button", name="生成三维视图图片", exact=True).click()
            expect(page.get_by_role("img", name="当前三维视图图片", exact=True)).to_be_visible(
                timeout=10000
            )
            assert (
                page.get_by_role("img", name="当前三维视图图片", exact=True)
                .get_attribute("src")
                .startswith("data:image/png;base64,")
            )
            record("protein-real-png")
            result("抗体人源参考与框架优化")
            expect(page.locator(".sequence-alignment")).to_be_visible()
            page.locator(".alignment-residues button").first.click()
            expect(page.locator(".sequence-alignment footer")).to_contain_text("IMGT")
            record("antibody-source-alignment")
            assert not errors, errors
            assert not submitted, submitted
            with sqlite3.connect(Path(os.environ["WB_STATE_DIR"]) / "jobs.sqlite3") as db:
                assert db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall() == before
        finally:
            (evidence / "result-visuals.json").write_text(
                json.dumps(
                    {"steps": steps, "errors": errors, "submitted": submitted},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            browser.close()
