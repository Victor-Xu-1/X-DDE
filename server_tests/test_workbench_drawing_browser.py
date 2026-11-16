"""Native workbench import/history acceptance, without research computation."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_undo_and_redo_survive_explicit_2d_preparation(language, width):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    source = Path("src/opendde_workbench/examples/stat6/inputs/STAT6-user-warhead.sdf")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    evidence = Path("server_tests/evidence/hydrogen-policy/workbench-history") / language
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="结构编辑" if zh else "Structure editor", exact=True).click()
        owner = page.locator(".editor-workspace")
        native = page.frame_locator('iframe[title="Ketcher molecular editor"]')
        save = owner.get_by_role("button", name="保存到工作台" if zh else "Save to Workbench", exact=True)
        prepare = owner.get_by_role("button", name="整理为二维结构" if zh else "Prepare 2D drawing", exact=True)
        expect(save).to_be_disabled()
        native.get_by_role("button", name="Open... (Ctrl+O)", exact=True).click()
        with page.expect_file_chooser() as chooser:
            native.get_by_role("button", name="or drag file here Open from file", exact=True).click()
        chooser.value.set_files(source.resolve())
        native.get_by_role("button", name="Open as New Project", exact=True).click()
        expect(prepare).to_be_enabled(timeout=30000)
        expect(save).to_be_disabled()
        expect(native.locator('[role="application"]')).to_be_hidden()
        prepare.click()
        expect(save).to_be_enabled(timeout=30000)
        expect(prepare).to_have_count(0)
        expect(native.locator('[role="application"]')).to_be_visible()
        prepared = page.evaluate("""async () => JSON.parse(await
          document.querySelector('.editor-workspace iframe').contentWindow.ketcher.getKet())""")
        for _ in range(2):
            native.get_by_role("button", name="Undo (Ctrl+Z)", exact=True).click()
            if _ == 0:
                expect(prepare).to_be_enabled()
            else:
                expect(prepare).to_have_count(0)
            expect(save).to_be_disabled()
        for _ in range(2):
            native.get_by_role("button", name="Redo (Ctrl+Shift+Z)", exact=True).click()
            if _ == 0:
                expect(prepare).to_be_enabled()
                expect(save).to_be_disabled()
            else:
                expect(save).to_be_enabled()
                expect(prepare).to_have_count(0)
        restored = page.evaluate("""async () => JSON.parse(await
          document.querySelector('.editor-workspace iframe').contentWindow.ketcher.getKet())""")
        assert prepared == restored
        # Reject an owned import without discarding the valid retained drawing
        # or exposing native parser traces to the research user.
        owner.locator('input[type="file"]').set_input_files({
            "name": "invalid-recovery-qa.mol", "mimeType": "chemical/x-mdl-molfile",
            "buffer": b"Invalid MOL for bounded editor recovery QA",
        })
        expect(owner.get_by_role("alert")).to_contain_text("无法打开此分子文件" if zh else "Unable to open this molecule")
        expect(prepare).to_be_enabled()
        expect(save).to_be_disabled()
        prepare.click()
        expect(save).to_be_enabled()
        expect(owner.get_by_role("alert")).to_have_count(0)
        assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
        assert page.request.get(base + "/api/jobs").json() == jobs
        page.screenshot(path=evidence / "native-history-restored.png", full_page=True)
        (evidence / "acceptance.json").write_text(json.dumps({
            "language": language, "width": width, "source_sha256": digest,
            "two_undo_redo_steps": True, "restored_ket_equal": True,
            "original_unchanged": True, "new_jobs": 0,
        }, indent=2))
        browser.close()
