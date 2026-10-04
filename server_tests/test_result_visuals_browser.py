"""Actual SVG/3D/plot/sequence interactions through frozen public case outputs."""

import json
import os
import sqlite3
import struct
import xml.etree.ElementTree as ET
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

        def download(control, filename):
            with page.expect_download(timeout=30000) as event:
                control.click()
            target = evidence / filename
            event.value.save_as(target)
            assert target.stat().st_size > 100
            return target

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
            page.get_by_label("二维图线条粗细", exact=True).select_option("2.2")
            expect(page.get_by_role("link", name="下载结构图片", exact=True)).to_be_visible(
                timeout=90000
            )
            structure = download(
                page.get_by_role("link", name="下载结构图片", exact=True), "native-molecule.svg"
            )
            assert ET.fromstring(structure.read_bytes()).tag.endswith("svg")
            plot = download(
                page.get_by_role("button", name="下载当前图表 SVG", exact=True), "native-properties.svg"
            )
            assert ET.fromstring(plot.read_bytes()).tag.endswith("svg")
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
            page.get_by_label("三维图片清晰度", exact=True).select_option("2")
            before_frame = page.locator(".viewer-panel iframe").bounding_box()
            page.get_by_role("button", name="生成三维视图图片", exact=True).click()
            expect(page.get_by_role("img", name="当前三维视图图片", exact=True)).to_be_visible(
                timeout=10000
            )
            assert (
                page.get_by_role("img", name="当前三维视图图片", exact=True)
                .get_attribute("src")
                .startswith("data:image/png;base64,")
            )
            png = download(
                page.get_by_role("link", name="下载视图 PNG", exact=True), "native-protein-2x.png"
            )
            raw = png.read_bytes()
            assert raw[:8] == b"\x89PNG\r\n\x1a\n"
            width, height = struct.unpack(">II", raw[16:24])
            assert 500 < width <= 4096 and 400 < height <= 4096
            assert width * height <= 8 * 1024**2
            assert page.locator(".viewer-panel iframe").bounding_box() == before_frame
            page.get_by_role("button", name="关闭图片", exact=True).click()
            page.get_by_label("下载原始结构文件", exact=True).click()
            download(
                page.get_by_role("link", name="原始结构 1", exact=True),
                "native-pocket-receptor.cif",
            )
            record("protein-real-png")
            result("口袋条件分子生成")
            expect(page.get_by_role("heading", name="生成的候选分子", exact=False)).to_be_visible(
                timeout=30000
            )
            expect(page.locator(".molecule-record")).to_have_count(5)
            expect(page.locator(".molecule-image img").first).to_be_visible(timeout=90000)
            expect(page.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
                timeout=30000
            )
            page.locator(".molecule-record").last.click()
            expect(
                page.locator(".result-inspector").get_by_role("heading", name="候选 5", exact=True)
            ).to_be_visible()
            record("generated-native-records")
            result("准备分子状态与构象")
            expect(page.locator(".state-collection-preview")).to_be_visible(timeout=30000)
            states = page.locator(".state-collection-preview > .research-table")
            expect(states.locator("tbody tr")).to_have_count(8)
            expect(page.locator(".state-conformer-stage .research-table tbody tr")).to_have_count(3)
            expect(page.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
                timeout=30000
            )
            conformer = download(
                page.get_by_role("link", name="下载当前构象 SDF", exact=True),
                "native-current-conformer.sdf",
            )
            assert "$$$$" in conformer.read_text()
            record("state-native-conformer-preview")
            result("结构引导序列设计")
            expect(page.locator(".candidate-chain-view .sequence-track").first).to_be_visible(
                timeout=30000
            )
            fasta = download(
                page.get_by_role("button", name="下载此序列 FASTA", exact=True).last,
                "native-designed-sequence.fasta",
            )
            assert fasta.read_text().startswith(">")
            assert len("".join(fasta.read_text().splitlines()[1:])) > 100
            record("designed-sequence-preview")
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
