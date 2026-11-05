"""Native Boltz input journey, modal keyboard behavior and responsive source UI."""

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
def test_boltz_source_bound_input_dialog(language, width, theme):
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    root = Path("outputs/boltz-input-settings") / f"{language}-{width}-{theme}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    writes, errors = [], []
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            f"localStorage.setItem('x-dde-theme','{theme}')"
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
        page.goto(base + "/#view=new&tool=boltz.predict")
        page.get_by_role("textbox", name=label("Sequence", "序列"), exact=True).fill(sequence)
        page.get_by_role("textbox", name="SMILES", exact=True).fill(WARHEAD)
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        expect(next_step).to_be_disabled()
        file_toggle = page.get_by_text(
            label("Or choose a molecular file", "或选择分子文件"), exact=True
        )
        expect(page.locator(".boltz-ligand-file input[type=file]")).not_to_be_visible()
        file_toggle.click()
        expect(page.locator(".boltz-ligand-file input[type=file]")).to_be_attached()
        file_toggle.click()
        expect(page.get_by_role("textbox", name="SMILES", exact=True)).to_have_value(WARHEAD)
        trigger = page.get_by_role(
            "button", name=label("Chain A MSA settings", "链 A MSA 设置"), exact=True
        )
        page.screenshot(path=root / "compact-inputs.png", full_page=True)
        trigger.click()
        dialog = page.get_by_role("dialog", name=label("MSA settings", "MSA 设置"), exact=True)
        expect(
            dialog.get_by_role("button", name=label("Close MSA settings", "关闭 MSA 设置"))
        ).to_be_focused()
        box = dialog.bounding_box()
        assert box and abs(box["width"] - min(520, width - 32)) < 1
        assert box["x"] >= 0 and box["x"] + box["width"] <= width
        assert dialog.evaluate("e => getComputedStyle(e).borderRadius") == "16px"
        assert dialog.evaluate("e => e.closest('form') === null")
        expect(dialog).to_contain_text("25 MiB")
        expect(dialog.get_by_role("radio")).to_have_count(2)
        expect(
            dialog.get_by_role("button", name=label("Save", "保存"), exact=True)
        ).to_be_disabled()
        page.screenshot(path=root / "chain-msa-dialog.png")
        single = dialog.get_by_role("radio", name=label("Single sequence", "单条序列"), exact=True)
        single.check()
        single.press("Enter")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name=label("Cancel", "取消"), exact=True).click()
        expect(trigger).to_be_focused()
        expect(next_step).to_be_disabled()
        trigger.click()
        expect(
            dialog.get_by_role("radio", name=label("MSA file", "MSA 文件"), exact=True)
        ).to_be_checked()
        single.check()
        dialog.get_by_role("button", name=label("Save", "保存"), exact=True).click()
        expect(trigger).to_be_focused()
        expect(next_step).to_be_enabled()
        next_step.click()
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        expect(trigger).to_contain_text(label("Single sequence", "单条序列"))
        trigger.click()
        dialog.press("Escape")
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "input": "Public STAT6 P42226 sequence and specified warhead",
                    "dialog_width": box["width"],
                    "save_cancel_escape_enter_focus": True,
                    "new_scientific_tasks": 0,
                    "writes": writes,
                    "scientific_acceptance": False,
                },
                indent=2,
            )
        )
        browser.close()
