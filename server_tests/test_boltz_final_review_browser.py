"""Bilingual Boltz-2 review over real isolated asset routes, without engine execution."""

import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_boltz_final_review_preserves_exact_chain_msa_and_record(language, width, tmp_path):
    evidence = Path("outputs/boltz-final-review") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    assets = Path("src/opendde_workbench/examples/stat6/inputs")
    sequence = "".join((assets / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])
    alignment = tmp_path / "STAT6-query-only.a3m"
    alignment.write_text(">STAT6 query only, browser fixture\n" + sequence + "\n")
    file = assets / "STAT6-CHEMBL982109-38-compounds.sdf"
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    writes, errors = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=boltz.predict")
        page.get_by_role("textbox", name=label("Sequence", "序列"), exact=True).fill(sequence)
        page.get_by_role(
            "button", name=label("Chain A MSA settings", "链 A MSA 设置"), exact=True
        ).click()
        msa_dialog = page.get_by_role("dialog", name=label("MSA settings", "MSA 设置"), exact=True)
        msa_dialog.locator("input[type=file]").set_input_files(alignment)
        save_msa = msa_dialog.get_by_role("button", name=label("Save", "保存"), exact=True)
        expect(save_msa).to_be_enabled()
        save_msa.click()
        page.get_by_text(label("Or choose a molecular file", "或选择分子文件"), exact=True).click()
        page.locator(".diff-reference input[type=file]").set_input_files(file)
        expect(page.locator(".boltz-msa-input").get_by_role("status")).to_contain_text(
            label("1 sequence rows · 847 alignment columns", "1 条序列 · 847 个比对列"),
        )
        record = page.get_by_role(
            "spinbutton",
            name=label("Molecule record in SDF (starts at 1)", "SDF 中第几个分子（从 1 开始）"),
            exact=True,
        )
        record.fill("500")
        step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        step.click()
        page.get_by_role(
            "checkbox",
            name=label("Also predict small-molecule affinity", "同时预测小分子亲和力"),
            exact=True,
        ).check()
        step.click()
        step.click()
        name = page.get_by_role("textbox", name=label("Task name", "任务名称"), exact=True)
        name.fill("STAT6 · Boltz-2 submission review")
        opener = page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        writes.clear()
        opener.click()
        dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        expect(dialog.get_by_role("alert")).to_contain_text(
            label("The selected files could not be verified", "无法核对所选文件")
        )
        submit = dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        expect(submit).to_be_disabled()
        page.keyboard.press("Escape")
        expect(opener).to_be_focused()
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        record.fill("2")
        for _ in range(3):
            step.click()
        opener.click()
        expect(dialog.get_by_text("STAT6 · Boltz-2 submission review", exact=True)).to_be_visible()
        expect(
            dialog.get_by_text(label("Original file record 2", "原文件条目 2"), exact=True)
        ).to_be_visible()
        settings = dialog.get_by_role(
            "complementary", name=label("Prediction settings", "预测设置")
        )
        expect(settings.locator(":scope > dl")).to_contain_text(label("Chain B", "链 B"))
        expect(dialog.locator(".prediction-preview-entity").first).to_have_attribute("open", "")
        expect(settings.get_by_role("link", name=alignment.name, exact=True)).to_be_visible()
        link = settings.get_by_role("link", name=file.name, exact=True)
        assert link.get_attribute("href").endswith("?record=1")
        expect(submit).to_be_disabled()
        assert dialog.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
        page.screenshot(path=str(evidence / "overview.png"))
        dialog.locator(".prediction-preview-entity > summary").nth(1).click()
        exact_link = dialog.get_by_role(
            "link", name=label("Download selected structure input", "下载已选结构文件"), exact=True
        )
        assert exact_link.get_attribute("href") == link.get_attribute("href")
        drawing = dialog.get_by_role("img", name=re.compile("二维分子结构|2D molecular structure"))
        dialog.locator(".molecule-image").scroll_into_view_if_needed()
        expect(drawing).to_be_visible(timeout=60000)
        assert drawing.evaluate("image => image.complete && image.naturalWidth > 0")
        page.screenshot(path=str(evidence / "selected-record.png"))
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        payload = json.loads(
            dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert payload["operation"] == "boltz_predict" and payload["payload"]["affinity"]
        by_role = {entry["role"]: entry["source"] for entry in payload["inputs"]}
        protein, ligand = payload["payload"]["components"]
        assert protein["id"] == "A" and protein["value"] == sequence
        assert protein["msa"] == by_role["msa"]
        assert protein["msa"]["sha256"] == hashlib.sha256(alignment.read_bytes()).hexdigest()
        assert ligand["id"] == "B" and ligand["source"] == by_role["ligand"]
        assert ligand["source"]["sha256"] == hashlib.sha256(file.read_bytes()).hexdigest()
        assert ligand["source"]["record"] == 1
        assert payload["scientific_inputs"] == [entry["source"] for entry in payload["inputs"]]
        page.screenshot(path=str(evidence / "request.png"))
        assert not writes and not errors
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "public_sequence_residues": len(sequence),
                    "record": 1,
                    "missing_record_blocked": True,
                    "verified_msa_chain": "A",
                    "affinity_chain": "B",
                    "api_writes_after_open": writes,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        browser.close()
