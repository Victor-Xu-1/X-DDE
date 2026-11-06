"""Native shared review layout and isolated spatial consumer; no inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


def isolated_state(tmp_path, monkeypatch):
    """Reuse CI drawing assets, while keeping each platform's database independent."""
    source = Path(os.environ["WB_STATE_DIR"]).resolve()
    runner = Path(os.environ["RUNNER_TEMP"]).resolve()
    assert source.is_relative_to(runner)
    config = (source / "deployment.json").read_bytes()
    assert Path(json.loads(config)["root"]).resolve().is_relative_to(runner)
    state = tmp_path / "state"
    state.mkdir()
    (state / "deployment.json").write_bytes(config)
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    return state


@pytest.mark.parametrize("language,width,height", [("en", 1280, 720), ("zh", 390, 844)])
def test_shared_job_layout_and_retained_native_entity(
    language, width, height, tmp_path, monkeypatch
):
    state = isolated_state(tmp_path, monkeypatch)
    evidence = Path("outputs/job-review-layout") / language
    evidence.mkdir(parents=True, exist_ok=True)
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    errors, writes = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})
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
        name.fill("STAT6 · Native input review")
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        page.get_by_role("button", name=label("MSA settings", "MSA 设置"), exact=True).click()
        page.get_by_role("radio", name=label("No MSA", "不使用 MSA"), exact=True).check()
        page.get_by_role("button", name=label("Save", "保存"), exact=True).click()
        next_step.click()
        next_step.click()
        opener = page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"), exact=True)
        expect(dialog.get_by_text("STAT6 · Native input review", exact=True)).to_be_visible()
        entities = dialog.locator(".prediction-preview-entity")
        expect(entities.first).to_have_attribute("open", "")
        expect(dialog.get_by_text("847 aa", exact=True)).to_be_visible()
        expect(dialog.get_by_text(label("Network access", "联网权限"), exact=True)).to_be_visible()
        expect(
            dialog.get_by_text(label("Compute device", "计算设备"), exact=True)
        ).not_to_be_visible()
        metrics = dialog.evaluate(
            """node => ({width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
              radius: getComputedStyle(node).borderTopLeftRadius,
              overflow: node.scrollWidth > node.clientWidth + 1})"""
        )
        assert not metrics["overflow"]
        if width == 1280:
            assert metrics["width"] == 1160 and metrics["radius"] == "15px"
            assert metrics["height"] <= 680
            identity = dialog.locator(".job-review-identity").bounding_box()
            settings = dialog.get_by_role("complementary").bounding_box()
            assert identity and settings and abs(identity["y"] - settings["y"]) < 2
            assert identity["x"] < settings["x"]
            sequence_view = dialog.locator(".sequence-track-scroll").bounding_box()
            footer = dialog.locator(":scope > footer").bounding_box()
            assert sequence_view and footer
            visible_sequence_height = min(
                sequence_view["y"] + sequence_view["height"], footer["y"]
            ) - sequence_view["y"]
            assert visible_sequence_height >= 160, "Repeated headings displaced the input sequence"
        page.screenshot(path=evidence / "sequence-overview.png")
        entities.first.locator("summary").first.click()
        entities.nth(1).locator("summary").first.click()
        drawing = entities.nth(1).locator(".molecule-image")
        drawing.scroll_into_view_if_needed()
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        request = json.loads(
            dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert request["payload"]["components"][0]["value"] == sequence
        expect(drawing).not_to_be_visible()
        dialog.get_by_role("button", name=label("Overview", "概览"), exact=True).click()
        expect(entities.first).not_to_have_attribute("open", "")
        expect(entities.nth(1)).to_have_attribute("open", "")
        expect(drawing).to_be_visible()
        page.screenshot(path=evidence / "retained-ligand.png")
        expect(
            dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        ).to_be_disabled()
        dialog.get_by_role("button", name=label("Edit setup", "编辑设置"), exact=True).click()
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()
        expect(name).to_have_value("STAT6 · Native input review")
        name.fill("STAT6 · Edited native input review")
        opener.click()
        expect(dialog.get_by_text("STAT6 · Edited native input review", exact=True)).to_be_visible()
        expect(dialog.get_by_text("STAT6 · Native input review", exact=True)).to_have_count(0)
        expect(entities.first).to_have_attribute("open", "")
        dialog.get_by_role("button", name=label("Back to edit", "返回编辑"), exact=True).click()
        expect(opener).to_be_focused()
        assert not errors and not writes
        assert page.request.get(base + "/api/jobs").json() == []
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "metrics": metrics,
                    "errors": errors,
                    "api_writes": writes,
                    "exact_sequence": True,
                    "retained_entity": True,
                },
                indent=2,
            )
        )
        browser.close()


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_spatial_design_shared_review(language, width, tmp_path, monkeypatch):
    from server_tests.test_diff_review_browser import test_diffsbdd_material_and_protocol_review

    state = isolated_state(tmp_path, monkeypatch)
    evidence = Path("outputs/job-review-layout") / ("spatial-" + language)
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(state, evidence / "service.log") as base:
        monkeypatch.setenv("WB_BROWSER_URL", base)
        test_diffsbdd_material_and_protocol_review(language, width)


def test_retained_native_camera_and_downloads(tmp_path, monkeypatch):
    from server_tests.job_review_scene_case import inspect_native_review_scene

    state = isolated_state(tmp_path, monkeypatch)
    evidence = Path("outputs/job-review-layout/native-scene")
    evidence.mkdir(parents=True, exist_ok=True)
    inspect_native_review_scene(state, evidence)
