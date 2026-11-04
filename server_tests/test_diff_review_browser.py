"""Read actual native material, review its selected protocol, and never start inference."""

import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import open_navigation, settings


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_diffsbdd_material_and_protocol_review(language, width):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence/prolif-contacts")
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        jobs_before = len(page.request.get(base + "/api/jobs").json())
        inputs = Path("src/opendde_workbench/examples/stat6/inputs")
        pdb = (inputs / "STAT6-9BIG-observed-receptor.pdb").read_bytes()
        reference = inputs / "9BIG-AK1690-A701.sdf"
        residue = "A:562"
        assert any(row.startswith(b"ATOM  ") and row[21:26] == b"A 562" for row in pdb.splitlines())
        input_file = evidence / f"review-source-{language}.pdb"
        input_file.write_bytes(pdb)
        if zh:
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
            page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="小分子设计" if zh else "Small-molecule design", exact=True
        ).click()
        upload = page.get_by_role(
            "group", name="选择材料" if zh else "Choose inputs", exact=True
        ).locator('input[type="file"]')
        expect(upload).to_have_count(1)
        upload.set_input_files(input_file)
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_enabled()
        next_button.click()
        if zh:
            page.get_by_role("combobox", name="如何指定口袋？").select_option("ligand")
            page.get_by_role("group", name="选择范围", exact=True).locator(
                'input[type="file"]'
            ).set_input_files(reference)
        else:
            page.get_by_role("textbox", name=re.compile("A:10")).fill(residue)
        next_button.click()
        count = page.get_by_role(
            "combobox", name="这次生成多少候选？" if zh else "How many candidates?"
        )
        count.select_option("10")
        page.get_by_role("combobox", name="使用哪个模型？" if zh else "Which model?").select_option(
            "moad_ca_cond"
        )
        page.get_by_role("button", name="专家微调" if zh else "Expert settings", exact=True).click()
        editor = page.get_by_role(
            "textbox",
            name="当前模式与模型的原生参数" if zh else "Native settings for this mode and model",
        )
        conditional = json.loads(editor.input_value())
        assert "steps" in conditional and "atoms" in conditional
        assert not {"resamplings", "jump_length", "fixed_atoms", "population"} & conditional.keys()
        page.get_by_role("combobox", name="使用哪个模型？" if zh else "Which model?").select_option(
            "moad_ca_joint"
        )
        expect(editor).to_have_value(re.compile("resamplings"))
        joint = json.loads(editor.input_value())
        assert {"resamplings", "jump_length"} <= joint.keys()
        page.get_by_role("combobox", name="使用哪个模型？" if zh else "Which model?").select_option(
            "moad_ca_cond"
        )
        page.get_by_role("textbox", name="任务名称（可选）" if zh else "Task name (optional)").fill(
            "Reviewed source and protocol"
        )
        next_button.click()
        open_review = page.get_by_role(
            "button", name="预览任务" if zh else "Preview job", exact=True
        )
        open_review.click()
        dialog = page.get_by_role("dialog", name="预览任务" if zh else "Preview job")
        review = dialog.locator("dl.questionnaire-review")
        expect(review.get_by_role("link", name=input_file.name, exact=True)).to_be_visible()
        geometry = dialog.get_by_role("region", name="受体与口袋" if zh else "Receptor and pocket")
        expect(geometry.frame_locator("iframe").locator("canvas").first).to_be_visible(
            timeout=20000
        )
        export = geometry.get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
        )
        expect(export).to_be_enabled(timeout=20000)
        assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        stage, panel = geometry.bounding_box(), review.bounding_box()
        assert stage and panel
        assert stage["y"] < panel["y"] if zh else stage["x"] < panel["x"]
        page.screenshot(path=evidence / f"design-review-{language}-{width}.png")
        expect(review.locator("dd").filter(has_text=re.compile(r"^10$"))).to_be_visible()
        expect(
            review.get_by_text(
                "Cα · moad · 条件生成" if zh else "Cα · moad · Conditional", exact=True
            )
        ).to_be_visible()
        if zh:
            source_link = review.get_by_role("link", name=reference.name, exact=True)
            assert source_link.get_attribute("href").endswith("?record=0")
        else:
            expect(
                geometry.get_by_text("Region residues located: 1 / 1", exact=False)
            ).to_be_visible()
            review.get_by_text("1 selected residue", exact=True).click()
            expect(review.get_by_text(residue, exact=True)).to_be_visible()
        with page.expect_download() as pending:
            review.get_by_role("link", name=input_file.name, exact=True).click()
        downloaded = evidence / f"review-download-{language}.pdb"
        pending.value.save_as(downloaded)
        assert hashlib.sha256(downloaded.read_bytes()).digest() == hashlib.sha256(pdb).digest()
        dialog.get_by_role("button", name="提交内容" if zh else "Request JSON", exact=True).click()
        reviewed = json.loads(
            dialog.get_by_label("X-DDE 提交请求" if zh else "X-DDE submission request").inner_text()
        )
        body = reviewed["payload"]
        assert body["options"]["count"] == 10 and body["options"]["model"] == "moad_ca_cond"
        assert body["protein"]["sha256"] == hashlib.sha256(pdb).hexdigest()
        if zh:
            assert (
                body["pocket"]["ligand"]["sha256"]
                == hashlib.sha256(reference.read_bytes()).hexdigest()
            )
        else:
            assert body["pocket"]["residues"][0]["number"] == 562
            assert body["pocket"]["residues"][0]["structure"] == body["protein"]
        page.keyboard.press("Escape")
        expect(open_review).to_be_focused()
        page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        count.select_option("3")
        next_button.click()
        open_review.click()
        expect(review.locator("dd").filter(has_text=re.compile(r"^3$"))).to_be_visible()
        assert len(page.request.get(base + "/api/jobs").json()) == jobs_before
        assert not errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / f"review-{language}-{width}.png", full_page=True)
        browser.close()
