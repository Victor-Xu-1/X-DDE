"""Review the archived STAT6 comparison in Chrome without dispatching an engine."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_archived_comparison_keeps_scene_and_residue_selection_linked(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("rmsd", verify=True)
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
                "link", name="完整位移 CSV" if zh else "Full displacement CSV", exact=True
            ).click()
        assert hashlib.sha256(Path(downloaded.value.path()).read_bytes()).hexdigest() == (
            result["artifact_sha256"]["residue-displacements.csv"]
        )
        assert not writes, writes
        browser.close()
