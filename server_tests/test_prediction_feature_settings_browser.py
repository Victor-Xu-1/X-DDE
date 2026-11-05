"""Compiled native forms and real modal behavior; no asset/job/model writes."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

WARHEAD = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


@pytest.mark.parametrize(
    "language,width,theme", [("en", 1440, "light"), ("zh", 390, "light"), ("en", 1440, "dark")]
)
def test_source_bound_msa_settings_on_native_forms(language, width, theme):
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    root = Path("outputs/prediction-feature-settings") / f"{language}-{width}-{theme}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    errors, writes, covered = [], [], []
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language','{language}');localStorage.setItem('x-dde-theme','{theme}')"
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        for tool in ("mol1.predict", "predict"):
            page.goto(base + "/#view=new&tool=" + tool)
            next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
            if tool == "predict":
                next_step.click()
            page.get_by_role(
                "textbox",
                name=label("One-letter amino-acid sequence", "单字母氨基酸序列"),
                exact=True,
            ).fill(sequence)
            page.get_by_role(
                "textbox",
                name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"),
                exact=True,
            ).fill(WARHEAD)
            next_step.click()
            trigger = page.get_by_role("button", name=label("MSA settings", "MSA 设置"), exact=True)
            before = trigger.inner_text()
            step = page.locator(
                '.questionnaire-steps button[aria-current="step"]:visible'
            ).get_attribute("aria-label")
            trigger.click()
            dialog = page.get_by_role("dialog", name=label("MSA settings", "MSA 设置"), exact=True)
            expect(dialog).to_be_visible()
            expect(
                dialog.get_by_role("button", name=label("Close MSA settings", "关闭 MSA 设置"))
            ).to_be_focused()
            box = dialog.bounding_box()
            assert box and abs(box["width"] - min(520, width - 32)) < 1
            assert box["x"] >= 0 and box["x"] + box["width"] <= width
            assert dialog.evaluate("e=>getComputedStyle(e).borderRadius") == "16px"
            assert dialog.evaluate("e=>getComputedStyle(e.querySelector('h2')).fontSize") == "18px"
            assert dialog.evaluate("e=>e.closest('form')===null")
            dialog.get_by_role("radio", name=label("Uploaded MSA", "已有 MSA"), exact=True).check()
            dialog.get_by_role("radio", name=label("Uploaded MSA", "已有 MSA"), exact=True).press(
                "Enter"
            )
            expect(dialog).to_be_visible()
            assert (
                page.locator(
                    '.questionnaire-steps button[aria-current="step"]:visible'
                ).get_attribute("aria-label")
                == step
            )
            page.screenshot(path=root / f"{tool}-msa-dialog.png")
            dialog.get_by_role("button", name=label("Cancel", "取消"), exact=True).click()
            expect(trigger).to_be_focused()
            assert trigger.inner_text() == before
            trigger.click()
            dialog.get_by_role("radio", name=label("No MSA", "不使用 MSA"), exact=True).check()
            dialog.get_by_role("button", name=label("Save", "保存"), exact=True).click()
            expect(dialog).to_have_count(0)
            expect(trigger).to_contain_text(label("No MSA", "不使用 MSA"))
            expect(
                page.get_by_role("combobox", name=label("Templates", "结构模板"), exact=True)
            ).to_be_disabled()
            trigger.click()
            expect(
                dialog.get_by_role("radio", name=label("No MSA", "不使用 MSA"), exact=True)
            ).to_be_checked()
            dialog.press("Escape")
            expect(dialog).to_have_count(0)
            expect(trigger).to_be_focused()
            trigger.click()
            dialog.get_by_role(
                "radio", name=label("Automatic search", "自动搜索"), exact=True
            ).check()
            consent = dialog.get_by_role(
                "checkbox",
                name=label(
                    "Allow this task to send sequences to the configured MSA service "
                    "and retrieve template structures",
                    "允许本任务发送序列到配置的 MSA 服务并获取模板结构",
                ),
                exact=True,
            )
            expect(consent).not_to_be_checked()
            consent.check()
            dialog.get_by_role("button", name=label("Save", "保存"), exact=True).click()
            expect(trigger).to_contain_text(label("Automatic search", "自动搜索"))
            trigger.click()
            expect(consent).to_be_checked()
            dialog.press("Escape")
            covered.append(tool)
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "forms": covered,
                    "input": "Public STAT6 P42226 sequence and specified warhead",
                    "save_cancel_focus_escape_enter": True,
                    "new_scientific_tasks": 0,
                    "writes": writes,
                    "scientific_acceptance": False,
                },
                indent=2,
            )
        )
        browser.close()
