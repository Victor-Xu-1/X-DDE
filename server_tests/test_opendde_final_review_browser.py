"""Compiled OpenDDE submission review against the real API, without inference."""

import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_opendde_final_review_uses_current_request(language, width):
    evidence = Path("outputs/opendde-final-review") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
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
        next_step.click()
        page.get_by_role(
            "textbox", name=label("One-letter amino-acid sequence", "单字母氨基酸序列"), exact=True
        ).fill(sequence)
        page.get_by_role(
            "textbox", name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"), exact=True
        ).fill(ligand)
        next_step.click()
        name = page.get_by_role("textbox", name=re.compile(label("Task name", "任务名称")))
        name.fill("STAT6 · OpenDDE submission review")
        next_step.click()
        preview = label("Preview job", "预览任务")
        opener = page.get_by_role("button", name=preview, exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=preview, exact=True)
        expect(dialog.get_by_role("heading", name=preview)).to_be_focused()
        expect(dialog.get_by_text("STAT6 · OpenDDE submission review", exact=True)).to_be_visible()
        expect(dialog.get_by_text(label("No MSA", "不使用 MSA"), exact=True)).to_be_visible()
        confirm = dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        expect(confirm).to_be_disabled()
        assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        page.screenshot(path=str(evidence / "overview.png"))
        dialog.locator(".prediction-preview-entity > summary").nth(1).click()
        dialog.locator(".molecule-image").scroll_into_view_if_needed()
        drawing = dialog.get_by_role("img", name=re.compile("二维分子结构|2D molecular structure"))
        expect(drawing).to_be_visible(timeout=60000)
        assert drawing.evaluate("image => image.complete && image.naturalWidth > 0")
        drawing.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / "molecule.png"))
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        task = json.loads(
            dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert task["operation"] == "predict"
        assert task["components"][0]["value"] == sequence
        assert task["components"][1]["value"] == ligand
        assert task["parameters"]["model"] == "standard"
        assert task["parameters"]["seed"] == 101
        assert task["project_id"] is None
        assert task["covalent_bonds"] == []
        page.keyboard.press("Escape")
        expect(opener).to_be_focused()
        expect(dialog).to_have_count(0)
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        name.fill("STAT6 · Updated review")
        next_step.click()
        opener.click()
        expect(dialog.get_by_text("STAT6 · Updated review", exact=True)).to_be_visible()
        assert not writes and not errors
        assert page.request.get(base + "/api/jobs").json() == []
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "residues": len(sequence),
                    "native_drawing": True,
                    "writes": writes,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
