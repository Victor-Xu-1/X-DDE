"""Compiled bilingual Mol-1 final preview; no task submit, model install or inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_final_prediction_review_without_engine(language, width):
    evidence = Path("outputs/mol1-final-review") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
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
        page.goto(base + "/#view=new&tool=mol1.predict")
        page.get_by_role(
            "textbox", name=label("One-letter amino-acid sequence", "单字母氨基酸序列"), exact=True
        ).fill(sequence)
        page.get_by_role(
            "textbox", name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"), exact=True
        ).fill("O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3")
        name = page.get_by_label(label("Task name (optional)", "任务名称（可选）"), exact=True)
        name.fill("STAT6 · Submission review")
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        page.get_by_role("button", name=label("MSA settings", "MSA 设置"), exact=True).click()
        page.get_by_role("radio", name=label("No MSA", "不使用 MSA"), exact=True).check()
        page.get_by_role("button", name=label("Save", "保存"), exact=True).click()
        next_step.click()
        next_step.click()
        preview_name = label("Preview job", "预览任务")
        opener = page.get_by_role("button", name=preview_name, exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=preview_name, exact=True)
        expect(dialog.get_by_role("heading", name=preview_name)).to_be_focused()
        expect(dialog.get_by_text("STAT6 · Submission review", exact=True)).to_be_visible()
        expect(dialog.get_by_text(label("Not submitted", "尚未提交"), exact=True)).to_be_visible()
        expect(
            dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        ).to_be_disabled()
        assert dialog.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
        if width == 390:
            identity = dialog.get_by_text("STAT6 · Submission review", exact=True).bounding_box()
            settings = dialog.get_by_role("complementary", name="预测设置").bounding_box()
            back = dialog.get_by_role("button", name="返回编辑", exact=True).bounding_box()
            submit = dialog.get_by_role("button", name="提交任务", exact=True).bounding_box()
            assert identity and settings and identity["y"] < settings["y"]
            assert back and submit and abs(back["width"] - submit["width"]) < 2
        page.screenshot(path=str(evidence / "overview.png"))
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        exact = dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求"))
        payload = json.loads(exact.inner_text())
        assert payload["operation"] == "mol1_predict"
        assert payload["payload"]["components"][0]["value"] == sequence
        assert payload["payload"]["feature_mode"] == "none"
        assert payload["options"]["seed"] == 101
        page.screenshot(path=str(evidence / "request.png"))
        page.keyboard.press("Escape")
        expect(opener).to_be_focused()
        expect(dialog).to_have_count(0)
        name.fill("STAT6 · Edited name")
        opener.click()
        expect(dialog.get_by_text("STAT6 · Edited name", exact=True)).to_be_visible()
        expect(dialog.get_by_text("STAT6 · Submission review", exact=True)).to_have_count(0)
        assert not writes and not errors
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "viewport_width": width,
                    "sequence_length": len(sequence),
                    "stale_review_replaced": True,
                    "unavailable_submission_blocked": True,
                    "api_writes": writes,
                    "page_errors": errors,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        browser.close()
