"""Compiled native plan editing and review, with no task submission or inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

WARHEAD = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


@pytest.mark.parametrize(
    "language,width,theme",
    [
        ("en", 1440, "light"),
        ("zh", 390, "light"),
        ("en", 1440, "dark"),
    ],
)
def test_native_calculation_plan_review(language, width, theme):
    def label(en, cn):
        return cn if language == "zh" else en

    root = Path("outputs/calculation-plan") / f"{language}-{width}-{theme}"
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
            lambda req: (
                writes.append(req.url)
                if req.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in req.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=boltz.predict")
        page.get_by_role("textbox", name=label("Sequence", "序列"), exact=True).fill(sequence)
        page.get_by_role("textbox", name="SMILES", exact=True).fill(WARHEAD)
        page.get_by_role("button", name=label("Chain A MSA settings", "链 A MSA 设置")).click()
        dialog = page.get_by_role("dialog", name=label("MSA settings", "MSA 设置"))
        dialog.get_by_role("radio", name=label("Single sequence", "单条序列")).check()
        dialog.get_by_role("button", name=label("Save", "保存"), exact=True).click()
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        next_step.click()
        count = page.get_by_role("spinbutton", name=label("Predicted structures", "预测构象数"))
        count.fill("11")
        expect(next_step).to_be_disabled()
        expect(count).to_have_value("11")
        count.fill("2")
        toggle = page.get_by_role("button", name=label("Advanced settings", "高级设置"), exact=True)
        toggle.press("Enter")
        expect(toggle).to_have_attribute("aria-expanded", "true")
        fields = [
            ("Recycling steps", "结构迭代轮数", "4"),
            ("Sampling steps", "构象采样步数", "180"),
            ("CPU cores", "CPU 核数", "4"),
            ("Memory budget (MiB)", "内存上限（MiB）", "9216"),
            ("Random seed", "随机种子", "202"),
        ]
        for en, cn, value in fields:
            page.get_by_role("spinbutton", name=label(en, cn), exact=True).fill(value)
        grids = page.locator(".scientific-plan-grid")
        columns = grids.evaluate_all("els => els.map(e => getComputedStyle(e).gridTemplateColumns)")
        assert columns and all(len(value.split()) == (1 if width < 600 else 2) for value in columns)
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        seed = page.get_by_role("spinbutton", name=label("Random seed", "随机种子"), exact=True)
        seed_box = seed.bounding_box()
        footer_box = page.locator(".questionnaire-actions:visible").bounding_box()
        assert seed_box and footer_box and seed_box["y"] + seed_box["height"] + 6 <= footer_box["y"]
        expect(seed).to_be_in_viewport()
        page.screenshot(path=root / "advanced-plan.png", full_page=True)
        toggle.press("Enter")
        expect(toggle).to_be_focused()
        expect(count).to_have_value("2")
        next_step.click()
        page.get_by_role("button", name=label("Back", "上一步"), exact=True).click()
        expect(count).to_have_value("2")
        toggle.click()
        for en, cn, value in fields:
            expect(page.get_by_role("spinbutton", name=label(en, cn), exact=True)).to_have_value(
                value
            )
        next_step.click()
        page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True).click()
        review = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        review.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        request = json.loads(
            review.get_by_label(
                label("X-DDE submission request", "X-DDE 提交请求"), exact=True
            ).text_content()
        )
        assert request["payload"]["samples"] == 2
        assert request["payload"]["recycling_steps"] == 4
        assert request["payload"]["sampling_steps"] == 180
        assert request["options"] == {"device": "cuda", "cpu": 4, "memory_mib": 9216, "seed": 202}
        assert request["payload"]["components"][0]["value"] == sequence
        assert request["payload"]["components"][1]["value"] == WARHEAD
        review.press("Escape")
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "native_request_preserved": True,
                    "advanced_columns": columns,
                    "keyboard_toggle": True,
                    "focused_seed_not_obscured_by_footer": True,
                    "back_forward": True,
                    "writes": writes,
                    "scientific_acceptance": False,
                },
                indent=2,
            )
        )
        browser.close()
