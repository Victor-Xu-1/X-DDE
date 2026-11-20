"""Replay the reviewed native three-assembly archive without launching a model."""

import hashlib
import json
import os
import shutil
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

JOB = "65e194f0-649c-4c8a-b414-de8d0b74758d"
ARCHIVE_SHA = "5652cba9a0628b31d0a8bb9791dc87984754d7df976dbce7c3834bd080389bb8"


def check_downloads(page, region, row, result, zh):
    complex_label = "PDB · 下载完整复合物" if zh else "PDB · Download complete complex"
    links = (
        (complex_label, row["complex_artifact"]),
        ("下载分子 SDF" if zh else "Download molecule SDF", row["ligand_artifact"]),
    )
    for name, artifact in links:
        action = region.get_by_role("link", name=name, exact=True)
        expect(action).to_be_in_viewport(ratio=1)
        with page.expect_download() as download:
            action.click()
        digest = hashlib.sha256(download.value.path().read_bytes()).hexdigest()
        assert digest == result["artifact_sha256"][artifact]


def native_view(region, artifact):
    panel = region.locator('[role="tabpanel"]:visible')
    ready = panel.locator(".viewer-panel .figure-export-trigger")
    expect(ready).to_be_enabled(timeout=35000)
    frame = panel.locator(".molecular-stage iframe")
    source = frame.content_frame.locator("html")
    expect(source).to_have_attribute("data-assembly-artifact", artifact, timeout=15000)
    return frame, ready


def inspect_layout(page, frame, width, height):
    canvas = frame.bounding_box()
    details = page.locator(".proximity-results .structure-workbench-details").bounding_box()
    assert canvas and details
    assert canvas["width"] >= {1180: 480, 1280: 575, 1600: 775}[width]
    if height <= 840:
        assert canvas["height"] >= 355 and canvas["y"] + canvas["height"] <= height + 2
    else:
        assert canvas["height"] >= 500 and height - canvas["y"] >= 320
    assert 0 < canvas["y"] < 380 and canvas["x"] + canvas["width"] < details["x"]
    assert frame.evaluate("node => getComputedStyle(node.parentElement).borderRadius") == "8px"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def double_column(dialog):
    expect(dialog.get_by_text("This structure needs more space.", exact=False)).to_be_visible(
        timeout=20000
    )
    dialog.get_by_role("combobox", name="Figure width").select_option("183")


def verify_viewer_disclosures(page, preview):
    disclosures = ((".viewer-mode-options", "input"), (".viewer-heading-actions", "select"))
    for region, control in disclosures:
        tool = preview.locator(region).locator(".viewer-tool-group")
        trigger = tool.locator(".viewer-tool-trigger")
        settings = tool.locator(".viewer-tool-content")
        field = settings.locator(control).first
        trigger.press("Enter")
        expect(trigger).to_have_attribute("aria-expanded", "true")
        expect(field).to_be_in_viewport()
        page.keyboard.press("Tab")
        expect(field).to_be_focused()
        field.press("Escape")
        expect(settings).to_be_hidden()
        expect(trigger).to_be_focused()


def inspect_molecular_vector(path):
    root = ET.fromstring(path.read_bytes())
    assert root.tag == "{http://www.w3.org/2000/svg}svg"
    assert root.attrib["width"] == "183mm"
    assert len(root.findall(".//{http://www.w3.org/2000/svg}path")) > 10
    assert not root.findall(".//{http://www.w3.org/2000/svg}image")


def inspect_pair(page, table, preview, rows, result, language, evidence):
    zh = language == "zh"
    fixture = ".proximity-results .structure-workbench"
    workspace = page.locator(fixture)
    for row in (rows[0], rows[2]):
        label = ("对比 " if zh else "Compare ") + row["id"]
        table.get_by_role("checkbox", name=label, exact=True).check()
    opener = table.get_by_role(
        "button", name="三维比较两个装配" if zh else "Compare two assemblies in 3D", exact=True,
    )
    opener.press("Enter")
    pair = page.get_by_role(
        "region", name="三维装配比较" if zh else "3D assembly comparison", exact=True,
    )
    heading = pair.get_by_role(
        "heading", name="装配并列比较" if zh else "Compare assemblies side by side",
    )
    expect(heading).to_be_focused()
    assert pair.locator("[data-workspace-expand]").count() == 1
    for slot, number in (("A", 1), ("B", 3)):
        row = rows[number - 1]
        label = ("装配 " if zh else "Assembly ") + str(number)
        pane = pair.get_by_role("region", name=f"{slot} · {label}", exact=True)
        expect(pane.locator(".proximity-check-fail")).to_be_visible()
        frame = pane.locator(".molecular-stage iframe")
        expect(frame.content_frame.locator("html")).to_have_attribute(
            "data-assembly-artifact", row["complex_artifact"], timeout=25000,
        )
        check_downloads(page, pane, row, result, zh)
    frames = pair.locator(".molecular-stage iframe")
    originals = frames.element_handles()
    assert len(originals) == 2
    pair.locator("[data-workspace-expand]").click()
    width = frames.first.bounding_box()["width"]
    pair.get_by_role("button", name="专注结构" if zh else "Focus structure").click()
    expect(workspace.locator(":scope > .structure-workbench-details")).to_be_hidden()
    rects = [frame.bounding_box() for frame in frames.all()]
    assert all(rect and rect["width"] > width * 1.25 for rect in rects)
    assert abs(rects[0]["y"] - rects[1]["y"]) <= 2
    assert abs(rects[0]["height"] - rects[1]["height"]) <= 2
    for frame, original in zip(frames.all(), originals, strict=True):
        assert frame.evaluate("(frame, original) => frame === original", original)
    if not zh:
        figures = []
        for index, slot in enumerate(("a", "b")):
            png = export_figure(
                page, pair.locator(".proximity-compare-panels .figure-export-trigger").nth(index),
                evidence,
                f"assembly-{slot}-view", language,
            )
            inspect_png(png)
            figures.append(png.read_bytes())
        assert figures[0] != figures[1]
        combined = pair.get_by_role("button", name="Export comparison ↓", exact=True)
        png = export_figure(page, combined, evidence, "assembly-pair-print", language)
        inspect_png(png)
        assert struct.unpack(">I", png.read_bytes()[20:24])[0] == 1051
    page.screenshot(path=evidence / "focused-assembly-comparison.png")
    pair.get_by_role(
        "button", name="返回单个装配" if zh else "Return to single assembly", exact=True,
    ).click()
    expect(pair).to_have_count(0)
    expect(preview.locator('[role="tabpanel"]:visible [data-workspace-expand]')).to_be_focused()
    expect(workspace).to_have_attribute("data-workspace-focus", "true")
    native_view(preview, rows[1]["complex_artifact"])
    page.keyboard.press("Escape")
    expect(workspace).not_to_have_attribute("data-workspace-expanded", "true")
    assert table.locator(".research-table-scroll").evaluate(
        "node => node.scrollWidth <= node.clientWidth + 1"
    )


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1180, 720),
    ("en", "warm", 1280, 800),
    ("zh", "dark", 1600, 900),
])
def test_native_ternary_desktop_workspace(tmp_path, monkeypatch, language, theme, width, height):
    zh = language == "zh"
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_RETAINED_TERNARY"]), settings, ARCHIVE_SHA)
    shutil.copyfile(
        os.environ["WB_PROXIMITY_GRAPHICS"], settings.state_dir / "deployment.json",
    )
    evidence = Path("outputs/proximity-desktop") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "server.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"""
          localStorage.setItem('opendde-workbench.language', '{language}');
          localStorage.setItem('x-dde-theme', '{theme}');
          window.addEventListener('message', event => {{
            if (event.origin !== location.origin || event.source !== window.parent ||
                event.data?.channel !== 'opendde-viewer' || event.data.type !== 'load') return;
            const file = new URL(event.data.value.urls[0], location.origin);
            document.documentElement.dataset.assemblyArtifact = file.searchParams.get('name');
          }});
        """)
        writes = []

        def read_only(route):
            if route.request.method in {"GET", "HEAD"}:
                route.continue_()
            else:
                writes.append(route.request.url)
                route.abort()

        page.route("**/api/**", read_only)
        power = base + "/api/runtime-controls?include_native=false"
        prior = page.request.get(power).json()
        result = page.request.get(f"{base}/api/jobs/{JOB}/result").json()
        rows = result["proximity"]["assemblies"]
        assert len(rows) == 3 and not any(row["quality"]["accepted"] for row in rows)
        page.goto(f"{base}/#task={JOB}")
        expect(page.locator("html")).to_have_attribute("data-theme", theme)
        name = "完整装配预览" if zh else "Complete assembly preview"
        preview = page.get_by_role("region", name=name, exact=True)
        frame, capture = native_view(preview, rows[0]["complex_artifact"])
        inspect_layout(page, frame, width, height)
        table = page.locator(".proximity-comparison .research-table")
        expect(table.locator("tbody tr").first).to_be_in_viewport(ratio=0.75)
        assert table.locator(".research-table-scroll").evaluate(
            "node => node.scrollWidth <= node.clientWidth + 1"
        )
        expect(preview.locator(".proximity-check-fail")).to_be_visible()
        if width == 1280:
            verify_viewer_disclosures(page, preview)
        page.screenshot(path=evidence / "workspace.png")
        check_downloads(page, preview, rows[0], result, zh)
        if not zh and width == 1280:
            png = export_figure(page, capture, evidence, "native-complex", language)
            inspect_png(png)

        preview.get_by_role("tab", name="分子三维" if zh else "Molecule 3D").press("Enter")
        _, ligand_capture = native_view(preview, rows[0]["ligand_artifact"])
        table.get_by_text("装配 2" if zh else "Assembly 2", exact=True).click()
        native_view(preview, rows[1]["ligand_artifact"])
        expect(preview.locator("iframe")).to_have_count(1)
        expect(ligand_capture).to_be_enabled()
        check_downloads(page, preview, rows[1], result, zh)
        preview.get_by_role("tab", name="分子二维" if zh else "Molecule 2D").press("Enter")
        drawing = preview.locator('[role="tabpanel"]:visible .molecule-image')
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=35000)
        expect(drawing.locator("img")).to_be_visible()
        page.screenshot(path=evidence / "selected-ligand-2d.png")
        if not zh and width == 1280:
            vector = export_figure(
                page, drawing.locator(".figure-export-trigger"), evidence,
                "selected-ligand", language, format="SVG", configure=double_column,
            )
            inspect_molecular_vector(vector)
        preview.get_by_role("tab", name="连接位点" if zh else "Attachment sites").press("Enter")
        frame, _ = native_view(preview, rows[1]["complex_artifact"])
        canvas = frame.bounding_box()
        assert canvas and canvas["width"] >= {1180: 480, 1280: 575, 1600: 775}[width]
        geometry = result["proximity"]["attachment_geometry"]["assemblies"]
        bonds = next(row["bonds"] for row in geometry if row["id"] == rows[1]["id"])
        cuts = page.locator(".structure-workbench-details .attachment-directions")
        expect(cuts.locator("tbody tr")).to_have_count(len(bonds))
        expect(cuts.locator("tbody tr").first).to_be_in_viewport(ratio=0.75)
        marker_label = "连接位点标记" if zh else "Attachment markers"
        selected_marker = preview.get_by_label(marker_label, exact=True)
        bond = cuts.get_by_role("button", name="查看连接" if zh else "Inspect bond", exact=False)
        bond.first.click()
        expect(selected_marker).to_have_text("1 处连接标记" if zh else "1 attachment markers")
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=evidence / "selected-attachment.png")
        preview.get_by_role("tab", name="完整复合物" if zh else "Complete complex").press("Enter")
        native_view(preview, rows[1]["complex_artifact"])
        inspect_pair(page, table, preview, rows, result, language, evidence)
        assert not writes and page.request.get(power).json() == prior
        assert all(not row["enabled"] and not row["active"] for row in prior["engines"])
        (evidence / "receipt.json").write_text(json.dumps({
            "archive_sha256": ARCHIVE_SHA, "job": JOB, "source_run": 40425851465,
            "rendered": [row["id"] for row in rows[:2]], "writes": writes,
        }, indent=2), encoding="utf-8")
        browser.close()
