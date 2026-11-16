"""Viewport, native-frame retention and adjacent task pane; no scientific jobs."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.test_stat6_templates_browser import catalog


@pytest.mark.parametrize("language,theme,width,height", [
    ("en", "warm", 1440, 900), ("zh", "dark", 390, 900), ("en", "light", 1280, 600),
])
def test_editor_canvas_and_adjacent_actions_preserve_the_native_drawing(language, theme, width, height):
    base, zh = os.environ["WB_BROWSER_URL"], language == "zh"
    evidence = Path("server_tests/evidence/hydrogen-policy/editor-layout") / f"{language}-{theme}"
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}');localStorage.setItem('x-dde-theme','{theme}')")
        page.goto(base)
        catalog(page, language)
        page.locator(".tool-card").get_by_role("heading", name=CAPABILITIES["properties"].label[not zh], exact=True).locator("..").click()
        with page.expect_response(lambda r: r.request.method == "POST" and r.url.endswith("/api/examples/properties/prepare")) as prepared:
            page.get_by_role("button", name="使用此模板" if zh else "Use this template", exact=True).click()
        assert prepared.value.ok
        original = prepared.value.json()["objects"]["study_ligand"]
        source_url = base + "/api/assets/" + original["reference"]["asset_id"]
        source = page.request.get(source_url).body()
        jobs = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role("button", name="研究空间" if zh else "Research workspace", exact=True).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role("button", name=("分子: " if zh else "Molecule: ") + original["label"], exact=True).click()
        page.get_by_role("button", name="编辑分子" if zh else "Edit molecule", exact=True).click()
        owner = page.locator(".editor-workspace")
        expect(owner.get_by_role("status")).to_contain_text("已打开所选版本" if zh else "Selected version opened", timeout=45000)
        frame = owner.locator('iframe[title="Ketcher molecular editor"]')
        native = page.frame_locator('iframe[title="Ketcher molecular editor"]')
        handle = frame.element_handle()
        before = page.evaluate("async () => JSON.parse(await document.querySelector('.editor-frames iframe').contentWindow.ketcher.getKet())")
        assert not native.get_by_role("button", name="3D Viewer", exact=True).is_visible()
        box = frame.bounding_box()
        assert box and box["height"] >= height * .5
        assert box["y"] + box["height"] <= height + 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert page.evaluate("document.documentElement.scrollHeight <= innerHeight + 1")
        owner.locator(".editor-help > summary").click()
        expect(owner.locator(".editor-help > p")).to_be_visible()
        help_box = owner.locator(".editor-help > p").bounding_box()
        assert help_box["x"] >= 0 and help_box["x"] + help_box["width"] <= width + 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert abs(frame.bounding_box()["height"] - box["height"]) < 1
        owner.locator(".editor-help > summary").click()
        owner.get_by_role("button", name="生成对齐的三维编辑版本" if zh else "Create an aligned 3D edit", exact=True).click()
        pane = owner.get_by_role("complementary", name="分子研究操作" if zh else "Molecule research actions", exact=True)
        expect(pane.get_by_role("region", name="三维编辑任务" if zh else "3D edit task", exact=True)).to_be_visible()
        assert pane.evaluate("node => node.scrollWidth <= node.clientWidth")
        if width > 960:
            assert pane.bounding_box()["x"] >= frame.bounding_box()["x"] + frame.bounding_box()["width"] - 1
            assert frame.bounding_box()["y"] + frame.bounding_box()["height"] <= height + 1
        pane.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        pane.get_by_role("button", name="读取当前编辑结构" if zh else "Read current edited structure", exact=True).click()
        expect(pane.get_by_text("已读取编辑内容" if zh else "Edit captured", exact=False)).to_be_visible()
        pane.get_by_role("button", name="返回编辑器" if zh else "Return to editor", exact=True).click()
        expect(pane).to_be_hidden()
        owner.get_by_role("button", name="用这个分子计算性质" if zh else "Calculate properties", exact=True).click()
        expect(pane.get_by_role("heading", name="检查分子并计算性质" if zh else "Review molecule and calculate properties", exact=True)).to_be_visible()
        if width > 960:
            heading_box = pane.get_by_role("heading", name="检查分子并计算性质" if zh else "Review molecule and calculate properties", exact=True).bounding_box()
            assert 0 <= heading_box["y"] - frame.bounding_box()["y"] <= 24
        assert pane.evaluate("node => node.scrollWidth <= node.clientWidth")
        pane.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        expect(pane.get_by_role("heading", name="2. 提供分子" if zh else "2. Provide molecules", exact=True)).to_be_visible()
        pane.get_by_role("button", name="关闭" if zh else "Close", exact=True).click()
        expect(pane).to_be_hidden()
        assert handle.evaluate("node => node.isConnected")
        assert page.evaluate("node => document.querySelector('.editor-frames iframe') === node", handle)
        restored = page.evaluate("async () => JSON.parse(await document.querySelector('.editor-frames iframe').contentWindow.ketcher.getKet())")
        assert before == restored
        assert page.request.get(source_url).body() == source
        assert page.request.get(base + "/api/jobs").json() == jobs
        page.screenshot(path=evidence / "editor-canvas.png", full_page=True)
        (evidence / "acceptance.json").write_text(json.dumps({"viewport": [width, height], "language": language,
            "theme": theme, "frame": box, "same_frame_and_graph": True, "new_jobs": 0,
            "source_sha256": hashlib.sha256(source).hexdigest()}, indent=2))
        browser.close()
