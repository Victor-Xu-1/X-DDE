"""Compiled OpenDDE draft recovery with public STAT6 inputs; no scientific submission."""

import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_opendde_draft_preserves_workflows_raw_text_and_native_review(language, width):
    evidence = Path("outputs/prediction-drafts/opendde") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"]) / "opendde-drafts" / f"{language}-{width}"
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    # Keep the database isolated, but reuse the CI's verified native drawing bundle.
    # A fresh state directory otherwise has no component registry and only an unavailable view.
    registry = (Path(os.environ["WB_STATE_DIR"]) / "deployment.json").read_bytes()
    assert (
        Path(json.loads(registry)["root"])
        .resolve()
        .is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    )
    state.mkdir(parents=True, exist_ok=True)
    (state / "deployment.json").write_bytes(registry)
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    ligand = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    writes, errors = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        assert page.request.get(base + "/api/deployment").json()["installed"].get("ketcher")
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
        page.goto(base + "/#view=new&tool=predict")
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        back = page.get_by_role("button", name=label("Back", "上一步"), exact=True)
        name = page.get_by_role(
            "textbox", name=label("Task name (optional)", "任务名称（可选）"), exact=True
        )
        name.fill("STAT6 · OpenDDE continued setup")
        page.get_by_role("button", name=label("Expert mode", "专家微调"), exact=True).click()
        page.get_by_role("radio", name=label("Protein structure", "蛋白结构"), exact=True).check()
        next_step.click()
        protein = page.get_by_role(
            "textbox", name=label("One-letter amino-acid sequence", "单字母氨基酸序列"), exact=True
        )
        protein.fill(sequence)
        back.click()
        page.get_by_role(
            "radio", name=label("Protein–ligand complex", "蛋白–小分子"), exact=True
        ).check()
        next_step.click()
        protein.fill(sequence)
        smiles = page.get_by_role(
            "textbox", name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"), exact=True
        )
        smiles.fill(ligand)
        next_step.click()
        seeds = page.get_by_role(
            "textbox",
            name=label("Additional seeds (comma separated)", "额外随机种子（逗号分隔）"),
            exact=True,
        )
        seeds.fill("4294967295, unfinished")
        expect(next_step).to_be_disabled()
        save = page.get_by_role("button", name=label("Save draft", "保存草稿"), exact=True)
        save.click()
        expect(
            page.get_by_text(label("Saved · Not submitted", "已保存 · 尚未提交"), exact=True)
        ).to_be_visible()
        rows = page.request.get(base + "/api/prediction-drafts?tool=predict").json()
        assert len(rows) == 1
        identifier = rows[0]["id"]
        saved = page.request.get(
            base + "/api/prediction-drafts/" + identifier + "?tool=predict"
        ).json()["state"]
        assert saved["integer_text"]["additional_seeds"] == "4294967295, unfinished"
        assert saved["workflows"]["protein"][0]["value"] == sequence
        assert saved["components"][1]["value"] == ligand
        assert "additional_seeds" not in saved["parameters"]
        assert page.request.get(base + "/api/prediction-drafts").json() == []
        page.reload()
        expect(name).to_have_value("")
        page.get_by_role("button", name=label("Open drafts", "打开草稿"), exact=True).click()
        dialog = page.get_by_role("dialog", name=label("Drafts", "草稿"), exact=True)
        expect(dialog).to_contain_text("OpenDDE")
        expect(dialog.get_by_text(saved["name"], exact=True)).to_be_visible()
        page.screenshot(path=evidence / "saved-drafts.png")
        resume = dialog.get_by_role("button", name=label("Resume", "继续编辑"), exact=True)
        resume.click()
        dialog.get_by_role("button", name=label("Cancel", "取消"), exact=True).click()
        expect(name).to_have_value("")
        resume.click()
        dialog.get_by_role(
            "button", name=label("Resume this draft", "恢复此草稿"), exact=True
        ).click()
        expect(dialog).to_have_count(0)
        expect(name).to_have_value(saved["name"])
        expect(
            page.get_by_role("button", name=label("Expert mode", "专家微调"), exact=True)
        ).to_have_attribute("aria-pressed", "true")
        # Alternative workflow input is retained, independently of the active complex.
        page.get_by_role("radio", name=label("Protein structure", "蛋白结构"), exact=True).check()
        next_step.click()
        expect(protein).to_have_value(sequence)
        back.click()
        page.get_by_role(
            "radio", name=label("Protein–ligand complex", "蛋白–小分子"), exact=True
        ).check()
        next_step.click()
        expect(protein).to_have_value(sequence)
        expect(smiles).to_have_value(ligand)
        next_step.click()
        expect(seeds).to_have_value("4294967295, unfinished")
        assert not seeds.evaluate("input => input.validity.valid")
        expect(seeds).to_have_attribute("aria-invalid", "true")
        expect(
            page.get_by_role("alert").filter(
                has_text=label("Use up to 7 distinct integers", "请填写最多 7 个互不重复的整数")
            )
        ).to_be_visible()
        assert seeds.evaluate(
            """input => getComputedStyle(input).borderTopColor === getComputedStyle(
              document.getElementById(input.getAttribute('aria-describedby'))).color"""
        ), "Invalid inputs must show the same danger color as their visible explanation"
        expect(next_step).to_be_disabled()
        seeds.scroll_into_view_if_needed()
        page.screenshot(path=evidence / "restored-unfinished-settings.png")
        seeds.fill("4294967295, 2026")
        expect(seeds).to_have_attribute("aria-invalid", "false")
        expect(seeds).not_to_have_attribute("aria-describedby")
        expect(next_step).to_be_enabled()
        save.click()
        expect(
            page.get_by_text(label("Saved · Not submitted", "已保存 · 尚未提交"), exact=True)
        ).to_be_visible()
        corrected = page.request.get(
            base + "/api/prediction-drafts/" + identifier + "?tool=predict"
        ).json()
        assert corrected["revision"] == 2
        next_step.click()
        preview = page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        preview.click()
        review = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        expect(
            review.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        ).to_be_disabled()
        review.locator(".prediction-preview-entity > summary").nth(1).click()
        review.locator(".molecule-image").scroll_into_view_if_needed()
        drawing = review.get_by_role("img", name=re.compile("二维分子结构|2D molecular structure"))
        expect(drawing).to_be_visible(timeout=90000)
        assert drawing.evaluate("image => image.complete && image.naturalWidth > 0")
        drawing.scroll_into_view_if_needed()
        page.screenshot(path=evidence / "restored-native-review.png")
        assert review.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        review.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        native = json.loads(
            review.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert native["name"] == saved["name"]
        assert native["components"][0]["value"] == sequence
        assert native["components"][1]["value"] == ligand
        assert native["parameters"] == corrected["state"]["parameters"]
        assert native["parameters"]["additional_seeds"] == [4294967295, 2026]
        assert native["project_id"] is None
        page.keyboard.press("Escape")
        expect(preview).to_be_focused()
        assert not errors, errors
        assert all(urlsplit(url).path.startswith("/api/prediction-drafts/") for url in writes), (
            writes
        )
        assert page.request.get(base + "/api/jobs").json() == []
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "residues": len(sequence),
                    "saved_draft": identifier,
                    "blank_new_task": True,
                    "explicit_resume": True,
                    "cached_workflow": True,
                    "invalid_raw_text_blocks_review": True,
                    "native_request_matches_corrected_snapshot": True,
                    "native_ketcher": True,
                    "scientific_jobs": 0,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
