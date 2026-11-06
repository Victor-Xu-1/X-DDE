"""Source-bound STAT6 draft recovery with real files, SQLite and compiled UI."""

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_boltz_draft_recovers_exact_materials_and_review_without_admission(
    language, width, tmp_path
):
    evidence = Path("outputs/prediction-drafts/boltz") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"]) / "boltz-drafts" / f"{language}-{width}"
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    inputs = Path("src/opendde_workbench/examples/stat6/inputs")
    sequence = "".join((inputs / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])
    alignment = tmp_path / "STAT6-query-only.a3m"
    alignment.write_text(">STAT6 query-only UI fixture, not research MSA\n" + sequence + "\n")
    ligand = inputs / "STAT6-CHEMBL982109-38-compounds.sdf"
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    errors, writes = [], []
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
        protein = page.get_by_role("textbox", name=label("Sequence", "序列"), exact=True)
        protein.fill(sequence)
        page.get_by_role(
            "button", name=label("Chain A MSA settings", "链 A MSA 设置"), exact=True
        ).click()
        msa_dialog = page.get_by_role("dialog", name=label("MSA settings", "MSA 设置"), exact=True)
        msa_dialog.locator("input[type=file]").set_input_files(alignment)
        save_msa = msa_dialog.get_by_role("button", name=label("Save", "保存"), exact=True)
        expect(save_msa).to_be_enabled()
        save_msa.click()
        page.get_by_text(label("Or choose a molecular file", "或选择分子文件"), exact=True).click()
        page.locator(".diff-reference input[type=file]").set_input_files(ligand)
        record = page.get_by_role(
            "spinbutton",
            name=label("Molecule record in SDF (starts at 1)", "SDF 中第几个分子（从 1 开始）"),
            exact=True,
        )
        record.fill("2")
        name = page.get_by_role(
            "textbox", name=label("Task name (optional)", "任务名称（可选）"), exact=True
        )
        expect(name).to_have_count(1)
        name.fill("STAT6 · Boltz saved inputs " + language)
        step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        expect(step).to_be_enabled()
        page.get_by_role("button", name=label("Save draft", "保存草稿"), exact=True).click()
        expect(
            page.get_by_text(label("Saved · Not submitted", "已保存 · 尚未提交"), exact=True)
        ).to_be_visible()
        drafts = page.request.get(base + "/api/prediction-drafts?tool=boltz.predict").json()
        assert len(drafts) == 1
        identifier = drafts[0]["id"]
        saved = page.request.get(
            base + f"/api/prediction-drafts/{identifier}?tool=boltz.predict"
        ).json()
        expected = saved["state"]
        assert (
            expected["components"][0]["msa"]["sha256"]
            == hashlib.sha256(alignment.read_bytes()).hexdigest()
        )
        assert (
            expected["components"][1]["source"]["sha256"]
            == hashlib.sha256(ligand.read_bytes()).hexdigest()
        )
        assert expected["components"][1]["source"]["record"] == 1
        assert page.request.get(base + "/api/prediction-drafts").json() == []
        page.reload()
        expect(protein).to_have_value("")
        expect(page.get_by_role("textbox", name="SMILES", exact=True)).to_have_value("")
        opener = page.get_by_role("button", name=label("Open drafts", "打开草稿"), exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=label("Drafts", "草稿"), exact=True)
        expect(dialog).to_contain_text("Boltz-2")
        expect(dialog.get_by_text(expected["name"], exact=True)).to_be_visible()
        assert dialog.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
        page.screenshot(path=evidence / "saved-drafts.png")
        dialog.get_by_role("button", name=label("Resume", "继续编辑"), exact=True).click()
        expect(protein).to_have_value("")
        dialog.get_by_role(
            "button", name=label("Resume this draft", "恢复此草稿"), exact=True
        ).click()
        expect(dialog).to_have_count(0)
        expect(protein).to_have_value(sequence)
        expect(name).to_have_value(expected["name"])
        # Reopened readiness is recomputed by the native MSA file inspector.
        expect(page.locator(".boltz-msa-input").get_by_role("status")).to_contain_text(
            label("847 alignment columns", "847 个比对列")
        )
        expect(step).to_be_enabled()
        for _ in range(3):
            step.click()
        preview = page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        preview.click()
        review = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        expect(
            review.get_by_text(label("Original file record 2", "原文件条目 2"), exact=True)
        ).to_be_visible()
        review.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        native = json.loads(
            review.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert native["payload"]["components"] == expected["components"]
        assert native["options"] == expected["options"]
        assert {key: native["payload"][key] for key in expected["settings"]} == expected["settings"]
        assert native["name"] == expected["name"]
        expect(
            review.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        ).to_be_disabled()
        page.screenshot(path=evidence / "recovered-native-review.png")
        page.keyboard.press("Escape")
        expect(preview).to_be_focused()
        assert not errors, errors
        inspections = [
            url for url in writes if urlsplit(url).path == "/api/scientific/boltz/msa-check"
        ]
        assert len(inspections) >= 2, "Restored MSA must receive a fresh source inspection"
        assert all(
            urlsplit(url).path.startswith(("/api/assets", "/api/prediction-drafts/"))
            or urlsplit(url).path == "/api/scientific/boltz/msa-check"
            for url in writes
        ), writes
        assert page.request.get(base + "/api/jobs").json() == []
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "draft_id": identifier,
                    "full_stat6_sequence": len(sequence),
                    "reverified_msa": True,
                    "exact_ligand_record": True,
                    "fresh_task_is_blank": True,
                    "preview_request_matches_saved_state": True,
                    "scientific_jobs": 0,
                    "page_errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
