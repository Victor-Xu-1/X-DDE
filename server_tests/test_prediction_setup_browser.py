"""Readable live prediction summaries; no tasks, assets or model execution."""

import base64
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_prediction_input_preview_browser import INPUTS, WARHEAD


def calculation_values(aside, zh):
    labels = {
        "seeds": "随机种子" if zh else "Seeds",
        "copies": "总拷贝数" if zh else "Total copies",
        "structures": "请求构象" if zh else "Requested structures",
    }
    return {key: aside.get_by_text(label, exact=True).locator("xpath=following-sibling::dd")
            .inner_text() for key, label in labels.items()}


def fill_current_materials(page, sequence, zh):
    form = page.locator(".prediction-form-body:visible")
    protein = form.locator('[data-entity-kind="protein"] textarea').first
    if not protein.is_visible():
        page.locator(".questionnaire:visible").get_by_role(
            "button", name="下一步" if zh else "Next", exact=True
        ).click()
    expect(protein).to_have_value("")
    protein.fill(sequence)
    ligand = form.locator('[data-entity-kind="ligand"] textarea').first
    has_ligand = ligand.is_visible()
    if has_ligand:
        expect(ligand).to_have_value("")
        ligand.fill(WARHEAD)
    return protein, has_ligand


def capture_setup(page, aside, evidence, name):
    page.mouse.move(1, 1)
    aside.scroll_into_view_if_needed()
    aside.evaluate("node => { const bar=document.querySelector('.studio-topbar'); "
                   "window.scrollBy(0,node.getBoundingClientRect().top-"
                   "(bar?.getBoundingClientRect().bottom||0)-12); }")
    page.screenshot(path=evidence / f"{name}.png")


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
@pytest.mark.parametrize("tool,model", [
    ("predict", "OpenDDE"), ("boltz.predict", "Boltz-2"), ("mol1.predict", "Mol-1"),
])
def test_live_setup_summary_and_native_input_preview(language, width, tool, model):
    evidence = Path("outputs/prediction-setup") / f"{tool}-{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join((INPUTS / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])
    zh = language == "zh"
    errors, writes = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda req: writes.append(req.url)
                if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
        try:
            page.goto(base + "/#view=new&tool=" + tool)
            aside = page.get_by_role("complementary", name="研究设置概览" if zh else "Study setup")
            expect(aside.get_by_text(model, exact=True)).to_be_visible()
            seeds = aside.get_by_text("随机种子" if zh else "Seeds", exact=True)
            expect(seeds).not_to_be_visible()
            details = aside.locator(".prediction-calculation-details")
            expect(aside.locator(".prediction-calculation-details[open]")).to_have_count(0)
            page.screenshot(path=evidence / "blank-form.png")
            capture_setup(page, aside, evidence, "closed-summary")
            details.locator("summary").click()
            expect(seeds).to_be_visible()
            before = calculation_values(aside, zh)
            capture_setup(page, aside, evidence, "expanded-summary")
            details.locator("summary").click()
            expect(seeds).not_to_be_visible()
            protein, has_ligand = fill_current_materials(page, sequence, zh)
            details.locator("summary").click()
            assert calculation_values(aside, zh) == before
            details.locator("summary").click()
            aside.get_by_role("button", name="预览输入" if zh else "Preview inputs",
                              exact=True).click()
            dialog = page.get_by_role(
                "dialog", name="预览研究输入" if zh else "Preview study inputs"
            )
            expect(dialog).to_be_visible()
            expect(dialog).to_contain_text(model)
            expect(dialog).to_contain_text(f"{len(sequence)} aa")
            if has_ligand:
                dialog.locator(".prediction-preview-entity > summary").nth(1).click()
                drawing = dialog.locator(".molecule-image")
                drawing.scroll_into_view_if_needed()
                expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
                uri = drawing.locator("img").get_attribute("src")
                assert uri and uri.startswith("data:image/svg+xml;base64,")
                svg = base64.b64decode(uri.split(",", 1)[1], validate=True)
                assert b"CH3" not in svg and b"<path" in svg
                (evidence / "native-current-molecule.svg").write_bytes(svg)
            page.mouse.move(1, 1)
            page.screenshot(path=evidence / "current-input-preview.png")
            dialog.get_by_role("button", name="返回编辑" if zh else "Back to edit",
                               exact=True).click()
            expect(protein).to_have_value(sequence)
            protein.fill(sequence[:-10])
            aside.get_by_role("button", name="预览输入" if zh else "Preview inputs",
                              exact=True).click()
            expect(dialog).to_contain_text(f"{len(sequence) - 10} aa")
            page.keyboard.press("Escape")
            expect(dialog).to_have_count(0)
            expect(seeds).not_to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert page.request.get(base + "/api/jobs").json() == []
            engines = page.request.get(base + "/api/runtime-controls").json()["engines"]
            assert not any(row["enabled"] for row in engines)
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "tool": tool, "model": model, "language": language, "width": width,
                "chrome": browser.version, "original_sequence_length": len(sequence),
                "edited_sequence_length": len(sequence) - 10,
                "native_warhead_drawn": has_ligand, "settings_unchanged": before,
                "writes": writes, "scientific_calculations": 0,
            }, indent=2))
        finally:
            browser.close()
