"""Replay the reviewed native three-assembly archive without launching a model."""

import hashlib
import json
import os
import shutil
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg

JOB = "65e194f0-649c-4c8a-b414-de8d0b74758d"
ARCHIVE_SHA = "5652cba9a0628b31d0a8bb9791dc87984754d7df976dbce7c3834bd080389bb8"


def check_downloads(page, region, row, result, zh):
    links = (
        ("下载完整复合物" if zh else "Download complete complex", row["complex_artifact"]),
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
    assert canvas["width"] >= (575 if width == 1280 else 775)
    assert canvas["height"] >= 500 and (height - canvas["y"]) >= 320
    assert 0 < canvas["y"] < 480 and canvas["x"] + canvas["width"] < details["x"]
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
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
        page.screenshot(path=evidence / "workspace.png")
        check_downloads(page, preview, rows[0], result, zh)
        if not zh:
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
        if not zh:
            vector = export_figure(
                page, drawing.locator(".figure-export-trigger"), evidence,
                "selected-ligand", language, format="SVG",
            )
            inspect_svg(vector, "O")
        preview.get_by_role("tab", name="连接位点" if zh else "Attachment sites").press("Enter")
        frame, _ = native_view(preview, rows[1]["complex_artifact"])
        canvas = frame.bounding_box()
        assert canvas and canvas["width"] >= (575 if width == 1280 else 775)
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
        assert not writes and page.request.get(power).json() == prior
        assert all(not row["enabled"] and not row["active"] for row in prior["engines"])
        (evidence / "receipt.json").write_text(json.dumps({
            "archive_sha256": ARCHIVE_SHA, "job": JOB, "source_run": 40425851465,
            "rendered": [row["id"] for row in rows[:2]], "writes": writes,
        }, indent=2), encoding="utf-8")
        browser.close()
