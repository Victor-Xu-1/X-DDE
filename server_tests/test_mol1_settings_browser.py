"""Native STAT6 settings and exact review on the compiled UI, without inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize(
    "language,width,theme", [("en", 1440, "light"), ("zh", 390, "light"), ("en", 1440, "dark")]
)
def test_mol1_numbered_seeds_and_compact_native_settings(language, width, theme):
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    root = Path("outputs/mol1-settings") / f"{language}-{width}-{theme}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    errors, writes = [], []
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
        page.goto(base + "/#view=new&tool=mol1.predict")
        page.get_by_role(
            "textbox", name=label("One-letter amino-acid sequence", "单字母氨基酸序列"), exact=True
        ).fill(sequence)
        page.get_by_role(
            "textbox", name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"), exact=True
        ).fill("O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3")
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        page.get_by_role("button", name=label("MSA settings", "MSA 设置"), exact=True).click()
        page.get_by_role("radio", name=label("No MSA", "不使用 MSA"), exact=True).check()
        page.get_by_role("button", name=label("Save", "保存"), exact=True).click()
        next_step.click()
        seeds = page.get_by_role("region", name=label("Seeds", "随机种子"), exact=True)
        expect(seeds).to_be_visible()
        add = seeds.get_by_role("button", name=label("Add seed", "添加种子"), exact=True)
        add.click()
        second = seeds.get_by_label(label("Seed 2", "种子 2"), exact=True)
        expect(second).to_have_value("102")
        expect(second).to_be_focused()
        focus_box = second.evaluate("""input => {
            const box = input.getBoundingClientRect();
            const viewport = input.closest('ul').getBoundingClientRect();
            const style = getComputedStyle(input);
            return {above: box.top - viewport.top, below: viewport.bottom - box.bottom,
                extent: parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset))};
        }""")
        assert min(focus_box["above"], focus_box["below"]) >= focus_box["extent"]
        page.screenshot(path=root / "seed-keyboard-focus.png")
        second.fill("")
        expect(next_step).to_be_disabled()
        second.fill("101")
        expect(next_step).to_be_disabled()
        second.fill("-1")
        expect(next_step).to_be_disabled()
        second.fill("202")
        expect(next_step).to_be_enabled()
        expect(
            page.get_by_role("combobox", name=label("Compute device", "计算设备"), exact=True)
        ).not_to_be_visible()
        samples = page.get_by_role(
            "spinbutton", name=label("Structures per seed", "候选构象数"), exact=True
        )
        cycles = page.get_by_role(
            "spinbutton", name=label("Recycling cycles", "结构优化轮数"), exact=True
        )
        steps = page.get_by_role(
            "spinbutton", name=label("Diffusion steps", "生成精细度（步）"), exact=True
        )
        samples.fill("2")
        cycles.fill("24")
        steps.fill("180")
        boxes = [field.bounding_box() for field in (samples, cycles, steps)]
        assert all(boxes)
        if width > 1000:
            assert max(box["y"] for box in boxes) - min(box["y"] for box in boxes) < 1
            assert all(box["width"] < 350 for box in boxes)
        assert page.locator(".mol1-settings").evaluate("e=>e.scrollWidth<=e.clientWidth+1")
        seeds.scroll_into_view_if_needed()
        page.screenshot(path=root / "sampling-and-seeds.png")
        for _ in range(6):
            add.click()
        expect(add).to_be_disabled()
        seeds.get_by_role("button", name=label("Remove seed 8", "删除种子 8"), exact=True).click()
        expect(add).to_be_enabled()
        for ordinal in range(7, 2, -1):
            seeds.get_by_role(
                "button", name=label(f"Remove seed {ordinal}", f"删除种子 {ordinal}"), exact=True
            ).click()
        page.get_by_text(label("Advanced computation", "专业计算设置"), exact=True).click()
        page.get_by_role(
            "combobox", name=label("Compute device", "计算设备"), exact=True
        ).select_option("cpu")
        expect(
            page.get_by_role("combobox", name=label("Numerical precision", "数值精度"), exact=True)
        ).to_have_value("fp32")
        page.get_by_role(
            "spinbutton", name=label("Memory limit (MiB)", "内存上限（MiB）"), exact=True
        ).fill("4096")
        page.get_by_role(
            "spinbutton", name=label("Memory limit (MiB)", "内存上限（MiB）"), exact=True
        ).scroll_into_view_if_needed()
        page.screenshot(path=root / "runtime-settings.png")
        next_step.click()
        page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True).click()
        dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        shown = json.loads(
            dialog.get_by_label(
                label("X-DDE submission request", "X-DDE 提交请求"), exact=True
            ).inner_text()
        )
        assert shown["options"] == {"device": "cpu", "cpu": 2, "memory_mib": 4096, "seed": 101}
        assert {
            key: shown["payload"][key]
            for key in ("samples", "cycles", "steps", "additional_seeds", "dtype")
        } == {"samples": 2, "cycles": 24, "steps": 180, "additional_seeds": [202], "dtype": "fp32"}
        assert shown["payload"]["components"][0]["value"] == sequence
        assert not writes and not errors, (writes, errors)
        assert page.request.get(base + "/api/jobs").json() == []
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "public_stat6_residues": len(sequence),
                    "exact_native_reviewed_settings": True,
                    "seed_limit": 8,
                    "new_tasks": 0,
                    "writes": writes,
                },
                indent=2,
            )
        )
        browser.close()
