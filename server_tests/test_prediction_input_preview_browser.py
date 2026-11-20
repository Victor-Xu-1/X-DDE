"""Current real STAT6 inputs and native drawing; no submitted jobs or inference."""

import base64
import json
import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

INPUTS = Path("src/opendde_workbench/examples/stat6/inputs")
WARHEAD = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_current_prediction_inputs_and_edit_return(language, width):
    evidence = Path("outputs/prediction-input-preview") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join((INPUTS / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])
    zh = language == "zh"
    errors, writes = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append((request.method, request.url))
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=mol1.predict")
        protein = page.get_by_role(
            "textbox",
            name="单字母氨基酸序列" if zh else "One-letter amino-acid sequence",
            exact=True,
        )
        ligand = page.get_by_role(
            "textbox", name="SMILES 或 CCD_ 编号" if zh else "SMILES or CCD_ identifier", exact=True
        )
        protein.fill(sequence)
        ligand.fill(WARHEAD)
        trigger = page.get_by_role(
            "button", name="预览输入" if zh else "Preview inputs", exact=True
        )
        trigger.click()
        dialog = page.get_by_role("dialog", name="预览研究输入" if zh else "Preview study inputs")
        expect(dialog).to_be_visible()
        expect(
            dialog.get_by_role(
                "heading", name="预览研究输入" if zh else "Preview study inputs", exact=True
            )
        ).to_be_focused()
        expect(
            dialog.get_by_text("尚未提交" if zh else "Not submitted", exact=True)
        ).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile("Submit|提交"))).to_have_count(0)
        expect(dialog.locator("[data-position]")).to_have_count(600)
        dialog.get_by_role("button", name="下一段" if zh else "Next segment", exact=True).click()
        expect(dialog.locator('[data-position="601"]')).to_be_visible()
        expect(dialog.locator(f'[data-position="{len(sequence)}"]')).to_be_visible()
        page.screenshot(path=str(evidence / "sequence-review.png"))
        dialog.get_by_role("group", name="研究组分" if zh else "Study entities").get_by_role(
            "button"
        ).nth(1).click()
        dialog.locator(".molecule-image").scroll_into_view_if_needed()
        drawing = dialog.get_by_role("img", name=re.compile("二维分子结构|2D molecular structure"))
        expect(drawing).to_be_visible(timeout=60000)
        assert drawing.evaluate("image => image.complete && image.naturalWidth > 0")
        uri = drawing.get_attribute("src")
        assert uri and uri.startswith("data:image/svg+xml;base64,")
        native_svg = base64.b64decode(uri.split(",", 1)[1], validate=True)
        root = ET.fromstring(native_svg)
        assert root.tag.endswith("svg") and len(list(root.iter())) > 25
        (evidence / "stat6-warhead-native.svg").write_bytes(native_svg)
        assert dialog.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
        box = dialog.bounding_box()
        assert box and box["x"] >= 0 and box["x"] + box["width"] <= width + 1
        for control in (
            dialog.get_by_role(
                "heading", name="预览研究输入" if zh else "Preview study inputs", exact=True
            ),
            dialog.get_by_role("button", name="返回编辑" if zh else "Back to edit", exact=True),
        ):
            bounds = control.bounding_box()
            assert bounds and bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= 1000
        page.screenshot(path=str(evidence / "native-molecule-review.png"))
        dialog.locator(".figure-export-trigger").click()
        figure = page.get_by_role(
            "dialog", name="导出文献图" if zh else "Export research figure", exact=True
        )
        expect(figure).to_be_visible()
        page.keyboard.press("Escape")
        expect(figure).to_have_count(0)
        expect(dialog).to_be_visible()
        expect(drawing).to_be_visible()
        page.screenshot(path=str(evidence / "nested-export-return.png"))
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()
        expect(protein).to_have_value(sequence)
        expect(ligand).to_have_value(WARHEAD)
        protein.fill(sequence[:-10])
        trigger.click()
        expect(dialog).to_contain_text(f"{len(sequence) - 10} aa")
        dialog.get_by_role("button", name="返回编辑" if zh else "Back to edit", exact=True).click()
        expect(trigger).to_be_focused()
        models = []
        for tool, model in (("predict", "OpenDDE"), ("boltz.predict", "Boltz-2")):
            page.goto(base + "/#view=new&tool=" + tool)
            other_trigger = page.get_by_role(
                "button", name="预览输入" if zh else "Preview inputs", exact=True
            )
            other_trigger.click()
            expect(dialog).to_be_visible()
            expect(dialog).to_contain_text(model)
            expect(dialog.get_by_role("button", name=re.compile("Submit|提交"))).to_have_count(0)
            page.screenshot(path=str(evidence / f"{tool}-overview.png"))
            dialog.get_by_role(
                "button", name="返回编辑" if zh else "Back to edit", exact=True
            ).click()
            expect(other_trigger).to_be_focused()
            models.append(model)
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        with sqlite3.connect(f"file:{state / 'jobs.sqlite3'}?mode=ro", uri=True) as db:
            counts = {
                table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                for table in ("jobs", "assets")
            }
        assert counts == {"jobs": 0, "assets": 0}
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "viewport": {"width": width, "height": 1000},
                    "input": "Public STAT6 P42226 and owner-supplied warhead; no prediction",
                    "sequence_length": len(sequence),
                    "other_models": models,
                    "native_drawing": True,
                    "writes": writes,
                    "database_counts": counts,
                    "scope": "Input review only; no native job or scientific-result acceptance",
                },
                indent=2,
            )
        )
        browser.close()


@pytest.mark.parametrize(
    ("language", "width", "height"), [("en", 1120, 650), ("zh", 1280, 700)]
)
def test_desktop_prediction_entry_and_original_coordinate_review(tmp_path, language, width, height):
    evidence = Path("outputs/prediction-input-preview") / f"desktop-{language}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    state.mkdir()
    (state / "deployment.json").write_bytes(
        (Path(os.environ["WB_STATE_DIR"]) / "deployment.json").read_bytes()
    )
    source = INPUTS / "9BIG-AK1690-A701.sdf"
    sequence = "".join((INPUTS / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])
    zh = language == "zh"
    next_name = "下一步" if zh else "Next"
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": width, "height": height}, reduced_motion="reduce",
        )
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        blocked = []

        def allow_input_upload(route):
            request = route.request
            if request.method in {"GET", "HEAD", "OPTIONS"} or (
                request.method == "POST" and request.url.startswith(base + "/") and
                urlsplit(request.url).path == "/api/assets"
            ):
                route.continue_()
            else:
                blocked.append(request.url)
                route.abort()

        page.route("**/api/**", allow_input_upload)
        page.goto(base + "/#view=new&tool=predict")
        form = page.locator(".prediction-workspace.is-input .questionnaire")
        expect(form.locator("> fieldset[aria-labelledby]:not([hidden])")).to_have_count(1)
        action = form.get_by_role("button", name=next_name, exact=True)
        trigger = page.get_by_role(
            "button", name="预览输入" if zh else "Preview inputs", exact=True
        )
        expect(action).to_be_in_viewport(ratio=1)
        expect(trigger).to_be_in_viewport(ratio=1)
        action.click()
        protein = form.get_by_role(
            "textbox", name="单字母氨基酸序列" if zh else "One-letter amino-acid sequence",
            exact=True,
        )
        protein.fill(sequence)
        expect(action).to_be_disabled()
        expect(action).to_be_in_viewport(ratio=1)
        expect(trigger).to_be_in_viewport(ratio=1)
        page.get_by_text(
            "使用已有的三维分子文件" if zh else "Use an existing 3D molecule file", exact=True,
        ).click()
        file_input = page.get_by_label("上传 配体文件" if zh else "Upload Ligand file")
        with page.expect_response(
            lambda response: urlsplit(response.url).path == "/api/assets" and
            response.request.method == "POST"
        ) as upload:
            file_input.set_input_files(source)
        assert upload.value.ok, upload.value.status
        assets = page.request.get(base + "/api/assets").json()
        [stored] = [asset for asset in assets if asset["name"] == source.name]
        asset_id = stored["id"]
        expect(action).to_be_enabled()
        expect(action).to_be_in_viewport(ratio=1)
        expect(trigger).to_be_in_viewport(ratio=1)
        assert page.evaluate(
            "scrollY === 0 && document.documentElement.scrollHeight <= innerHeight + 1"
        )
        setup = page.locator(".prediction-workspace.is-input .prediction-setup").bounding_box()
        assert setup and 0 <= width - (setup["x"] + setup["width"]) < 55
        action.click()
        expect(form.get_by_role(
            "heading", name="选择方案" if zh else "Choose settings"
        )).to_be_visible()
        form.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(protein).to_have_value(sequence)
        expect(action).to_be_enabled()
        page.screenshot(path=evidence / "desktop-inputs.png")
        trigger.click()
        dialog = page.get_by_role("dialog", name="预览研究输入" if zh else "Preview study inputs")
        entities = dialog.get_by_role("group", name="研究组分" if zh else "Study entities")
        expect(dialog.locator("[data-position]")).to_have_count(600)
        entities.get_by_role("button").nth(1).click()
        expect(dialog.locator("[data-position]")).to_have_count(0)
        expect(dialog.locator(".molecular-stage iframe")).to_have_count(0)
        coordinates = dialog.get_by_role(
            "tab", name="原始三维坐标" if zh else "Source 3D coordinates",
        )
        with page.expect_response(f"{base}/api/assets/{asset_id}") as original:
            coordinates.click()
        assert original.value.ok
        expect(dialog.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view",
        )).to_be_enabled(timeout=45000)
        frame = dialog.locator(".molecular-stage iframe")
        expect(frame).to_be_in_viewport(ratio=1)
        viewer = frame.bounding_box()
        sidebar = dialog.locator(".prediction-input-sidebar").bounding_box()
        assert viewer and sidebar and viewer["height"] >= 300
        assert viewer["x"] + viewer["width"] < sidebar["x"]
        download = dialog.get_by_role(
            "link", name="下载已选结构文件" if zh else "Download selected structure input",
        )
        expect(download).to_be_in_viewport(ratio=1)
        with page.expect_download() as saved:
            download.click()
        assert saved.value.path().read_bytes() == source.read_bytes()
        page.screenshot(path=evidence / "original-coordinates.png")
        dialog.get_by_role("tab", name="二维结构" if zh else "2D structure").click()
        expect(frame).to_be_hidden()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()
        expect(protein).to_have_value(sequence)
        expect(action).to_be_enabled()
        assert not blocked
        assert page.request.get(base + "/api/jobs").json() == []
        browser.close()
