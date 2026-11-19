"""Review the archived STAT6 comparison in Chrome without dispatching an engine."""

import hashlib
import json
import os
import re
import struct
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png


def read_camera(frame):
    return frame.evaluate("""frame => new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const target = frame.contentWindow;
      const timeout = setTimeout(() => finish(), 4000);
      function receive(event) {
        if (event.source === target && event.origin === location.origin &&
            event.data?.channel === "opendde-viewer" &&
            event.data.type === "camera" && event.data.detail?.id === id) {
          finish(event.data.detail.camera);
        }
      }
      function finish(camera) {
        clearTimeout(timeout);
        window.removeEventListener("message", receive);
        if (Array.isArray(camera) && camera.length === 8) resolve(camera);
        else reject(Error("The loaded structure did not return a camera"));
      }
      window.addEventListener("message", receive);
      const request = {channel: "opendde-viewer", type: "camera-read", value: id};
      target.postMessage(request, location.origin);
    })""")


def verify_aligned_pair(page, panel, result, evidence):
    overlay = panel.get_by_role("button", name="Aligned overlay", exact=True)
    pair = panel.get_by_role("button", name="Aligned side by side", exact=True)
    match = panel.get_by_role("button", name="Match views", exact=True)
    pair.click()
    expect(match).to_be_enabled(timeout=45000)
    left = panel.get_by_role("region", name="A · Reference structure", exact=True)
    right = panel.get_by_role("region", name="B · Aligned comparison", exact=True)
    for section, label, filename in (
        (left, "Reference structure", "reference-selected.cif"),
        (right, "Aligned comparison", "moving-aligned.cif"),
    ):
        expect(section.get_by_role("status").filter(
            has_text="Region residues located: 1 / 1"
        )).to_be_visible(timeout=15000)
        with page.expect_download() as downloaded:
            section.get_by_role("button", name=f"Download {label} CIF", exact=True).click()
        sha256 = hashlib.sha256(Path(downloaded.value.path()).read_bytes()).hexdigest()
        assert sha256 == result["artifact_sha256"][filename]

    a = left.locator(".molecular-stage iframe")
    b = right.locator(".molecular-stage iframe")
    b.evaluate("""frame => frame.contentWindow.postMessage(
      {channel: "opendde-viewer", type: "residue", value: "A:LEU198"}, location.origin
    )""")
    expect(panel.locator(".comparison-preview-header output")).to_contain_text(
        "A:198 → A:198", timeout=15000,
    )
    a_bounds, b_bounds = a.bounding_box(), b.bounding_box()
    assert a_bounds and b_bounds
    assert a_bounds["x"] + a_bounds["width"] < b_bounds["x"]
    assert abs(a_bounds["y"] - b_bounds["y"]) < 2
    a_handle, b_handle = a.element_handle(), b.element_handle()
    panel.get_by_role("button", name="Expand research workspace", exact=True).click()
    focus = panel.get_by_role("button", name="Focus structure", exact=True)
    focus.click()
    expect(panel.locator(".structure-workbench-details")).to_be_hidden()
    assert a.bounding_box()["width"] > a_bounds["width"]
    assert a_handle.evaluate("(node) => node.isConnected")
    assert b_handle.evaluate("(node) => node.isConnected")
    overlay.click()
    expect(overlay).to_have_attribute("aria-pressed", "true")
    expect(panel.locator(".structure-workbench-details")).to_be_hidden()
    pair.click()
    expect(match).to_be_enabled(timeout=45000)
    expect(panel.locator(".structure-workbench-details")).to_be_hidden()
    panel.get_by_role("button", name="Show analysis panel", exact=True).click()
    panel.get_by_role("button", name="Close expanded view", exact=True).click()
    expect(panel.locator(".structure-workbench-details")).to_be_visible()

    left.get_by_role("button", name="Zoom in", exact=True).click()
    assert read_camera(a) != pytest.approx(read_camera(b), abs=1e-6)
    match.click()
    expect(match).to_be_enabled()
    matched = read_camera(a)
    assert read_camera(b) == pytest.approx(matched, abs=1e-6)
    overlay.click()
    expect(overlay).to_have_attribute("aria-pressed", "true")
    pair.click()
    expect(match).to_be_enabled(timeout=45000)
    assert read_camera(a) == pytest.approx(matched, abs=1e-6)
    assert read_camera(b) == pytest.approx(matched, abs=1e-6)

    expanded = panel.get_by_role("button", name="Expand research workspace", exact=True)
    expanded.click()
    focus.click()
    expect(panel.locator(".structure-workbench-details")).to_be_hidden()
    wide_camera = read_camera(a)
    wide_fit = viewport_fit(a)
    overlay.click()
    expect(overlay).to_have_attribute("aria-pressed", "true")
    panel.get_by_role("button", name="Close expanded view", exact=True).click()
    pair.click()
    expect(match).to_be_enabled(timeout=45000)
    narrow_camera = read_camera(a)
    narrow_fit = viewport_fit(a)
    assert abs(wide_fit - narrow_fit) > 0.05
    assert narrow_camera[:3] + narrow_camera[4:] == pytest.approx(
        wide_camera[:3] + wide_camera[4:], abs=1e-6,
    )
    # The pinned renderer places its perspective camera at z=150.
    assert 150 - narrow_camera[3] == pytest.approx(
        (150 - wide_camera[3]) * wide_fit / narrow_fit,
        abs=1e-5,
    )
    page.screenshot(path=evidence / "aligned-pair.png")

    figures = []
    for section, filename in ((left, "aligned-reference"), (right, "aligned-moving")):
        figure = export_figure(
            page, section.get_by_role("button", name="Export figure ↓", exact=True),
            evidence, filename, "en",
        )
        inspect_png(figure)
        figures.append(hashlib.sha256(figure.read_bytes()).hexdigest())
    assert len(set(figures)) == 2
    combined = panel.get_by_role("button", name="Export comparison ↓", exact=True)

    def double_column(dialog):
        expect(dialog.get_by_label("Structure size")).to_have_value("auto")
        dialog.get_by_label("Figure width").select_option("183")

    png = export_figure(
        page, combined, evidence, "aligned-pair-print", "en", configure=double_column,
    )
    inspect_png(png, width=4323)
    assert struct.unpack(">I", png.read_bytes()[20:24])[0] == 2162
    assert read_camera(a) == pytest.approx(narrow_camera, abs=1e-6)


def viewport_fit(frame):
    return frame.evaluate("""frame => {
      const box = frame.contentDocument.getElementById("molecule").getBoundingClientRect();
      return Math.min(1, box.width / box.height);
    }""")


def verify_changed_source_is_rejected(page, panel):
    moving = re.compile(r"/download\?name=moving-aligned\.cif$")
    page.route(moving, lambda route: route.fulfill(
        body="data_changed", headers={"X-Structure-Format": "cif"}, status=200,
    ))
    observed_downloads = []
    page.on("download", lambda download: observed_downloads.append(download))
    panel.get_by_role("button", name="Aligned overlay", exact=True).click()
    expect(panel.locator(".viewer-error")).to_be_visible(timeout=15000)
    expect(panel.get_by_role("button", name="Export figure ↓", exact=True)).to_be_disabled()
    panel.get_by_role("button", name="Aligned side by side", exact=True).click()
    right = panel.get_by_role("region", name="B · Aligned comparison", exact=True)
    expect(right.locator(".viewer-error")).to_be_visible(timeout=15000)
    expect(panel.get_by_role("button", name="Export comparison ↓", exact=True)).to_be_disabled()
    right.get_by_role("button", name="Download Aligned comparison CIF", exact=True).click()
    expect(right.locator(".verified-artifact-download").get_by_role("alert")).to_contain_text(
        "Could not verify the saved file."
    )
    summary = panel.get_by_role("region", name="Alignment summary", exact=True)
    summary.get_by_role("button", name="Aligned structure mmCIF", exact=True).click()
    expect(summary.get_by_role("alert")).to_contain_text("Could not verify the saved file.")
    assert not observed_downloads
    page.unroute(moving)


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_archived_comparison_keeps_scene_and_residue_selection_linked(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).get("rmsd", verify=True)
    assert pin and pin.job_id
    job = store.get(str(pin.job_id))
    assert job and job.request.operation == "structure_compare"
    output = settings.state_dir / "jobs" / job.id / "output"
    result = json.loads((output / "result.json").read_text())
    evidence = Path("outputs/comparison-layout") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"

    with platform(settings.state_dir, evidence / "server.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 850 if not zh else 775})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        writes = []
        page.on("request", lambda req: writes.append(req.url) if req.method == "POST" else None)
        page.goto(base + "/#task=" + job.id)
        panel = page.locator(".comparison-result-view")
        stage = panel.locator(".molecular-stage iframe").first
        plot_label, table_label = ("位移图", "残基表") if zh else ("Plot", "Residues")
        plot_tab = panel.get_by_role("tab", name=plot_label, exact=True)
        residues_tab = panel.get_by_role("tab", name=table_label, exact=True)
        graph = panel.get_by_role("tabpanel", name=plot_label, exact=True)
        expect(plot_tab).to_have_attribute("aria-selected", "true")
        expect(graph.locator(".js-plotly-plot")).to_be_visible(timeout=30000)
        capture = panel.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=45000)
        initial_scene = stage.element_handle()
        assert initial_scene
        expect(panel.get_by_role("table")).to_have_count(0)

        plot_tab.press("ArrowRight")
        expect(residues_tab).to_have_attribute("aria-selected", "true")
        expect(graph).to_be_hidden()
        table = panel.get_by_role(
            "table", name="逐残基比较" if zh else "Per-residue comparison", exact=True
        )
        expect(table).to_be_visible()
        row = table.locator("tbody tr").nth(15)
        row.press("Enter")
        expect(row).to_have_attribute("aria-selected", "true")
        preview_header = panel.locator(".comparison-preview-header")
        selected = preview_header.locator("output")
        expect(selected).to_contain_text("→")
        expect(
            panel.get_by_role("status").filter(
                has_text="已定位区域残基" if zh else "Region residues located"
            )
        ).to_contain_text("2 / 2", timeout=15000)
        if zh:
            panel.get_by_role("button", name="查看选中残基", exact=True).click()
            expect(preview_header).to_be_focused()
            expect(preview_header).to_be_in_viewport(ratio=1)
        expect(stage).to_be_in_viewport(ratio=0.65)
        page.screenshot(path=evidence / "selected-residue.png")

        search = panel.get_by_role("searchbox")
        search.fill("靶蛋白" if zh else "Target")
        plot_tab.click()
        expect(graph.locator(".js-plotly-plot")).to_be_visible()
        expect(table).to_be_hidden()
        residues_tab.click()
        expect(search).to_have_value("靶蛋白" if zh else "Target")
        assert initial_scene.evaluate("(frame) => frame.isConnected")
        expect(selected).to_contain_text("→")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")

        with page.expect_download() as downloaded:
            panel.get_by_role(
                "button", name="完整位移 CSV" if zh else "Full displacement CSV", exact=True
            ).click()
        assert hashlib.sha256(Path(downloaded.value.path()).read_bytes()).hexdigest() == (
            result["artifact_sha256"]["residue-displacements.csv"]
        )
        if not zh:
            verify_aligned_pair(page, panel, result, evidence)
            verify_changed_source_is_rejected(page, panel)
        assert not writes, writes
        browser.close()
