"""Actual retained STAT6 structures, candidate controls and figure download in fullscreen."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6_bundle_release import CAPABILITIES, SHA256
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.fullscreen_browser_helpers import inspect_full_workspace
from server_tests.publication_browser_helpers import export_figure, inspect_png


@pytest.fixture(scope="module")
def restored_workspace():
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    restored = restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, SHA256)
    assert restored["computed"] == len(CAPABILITIES)
    store = Store(settings.state_dir / "jobs.sqlite3")
    return settings, store, ExamplePins(store, settings.state_dir, modules=MODULES)


@pytest.mark.parametrize(
    ("capability", "language", "width", "height"),
    [("gnina.dock", "en", 1280, 720), ("p2rank.detect", "zh", 1600, 900)],
)
def test_desktop_structure_focus_uses_the_same_scene(
    restored_workspace, capability, language, width, height
):
    settings, store, pins = restored_workspace
    pin = pins.get(capability, verify=True)
    assert pin
    zh = language == "zh"
    evidence = Path("outputs/workspace-fullscreen/focus") / language / capability
    evidence.mkdir(parents=True, exist_ok=True)
    before = {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: writes.append(request.url)
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
            else None,
        )
        page.goto(base + "/#task=" + str(pin.job_id))
        workspace = page.locator(".structure-workbench").first
        viewer = workspace.locator(".viewer-panel").first
        stage = viewer.locator(".molecular-stage")
        frame = stage.locator("iframe")
        export = viewer.get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
        )
        expand = viewer.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True,
        )
        focus = viewer.get_by_role("button", name="专注结构" if zh else "Focus structure")
        restore = viewer.get_by_role(
            "button", name="显示分析面板" if zh else "Show analysis panel",
        )
        details = workspace.locator(":scope > .structure-workbench-details")
        expect(export).to_be_enabled(timeout=45000)
        original = frame.element_handle()
        await_frame = (
            "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"
        )
        expand.click()
        expect(focus).to_be_visible()
        page.evaluate(await_frame)
        split = stage.bounding_box()
        assert split
        expected_scroll = details.evaluate("node => (node.scrollTop = 60, node.scrollTop)")
        focus.click()
        expect(details).to_be_hidden()
        expect(restore).to_be_focused()
        page.evaluate(await_frame)
        wide = stage.bounding_box()
        pane = workspace.locator(":scope > .structure-workbench-view").bounding_box()
        assert wide and pane
        assert wide["width"] > split["width"] * 1.25
        assert wide["width"] > pane["width"] * 0.97 and wide["height"] > split["height"]
        assert wide["y"] + wide["height"] <= pane["y"] + pane["height"] + 1
        assert stage.evaluate("node => getComputedStyle(node).borderRadius") == "10px"
        assert frame.evaluate("(node,original) => node === original", original)
        page.screenshot(path=str(evidence / "focused.png"))
        output = export_figure(page, export, evidence, "focused-native-figure", language)
        inspect_png(output)
        expect(workspace).to_have_attribute("data-workspace-focus", "true")
        restore.click()
        expect(details).to_be_visible()
        assert details.evaluate("node => node.scrollTop") == expected_scroll
        assert frame.evaluate("(node,original) => node === original", original)
        focus.click()
        if not zh:
            drawing = workspace.get_by_role("tab", name="2D structure", exact=True)
            drawing.click()
            expect(workspace).not_to_have_attribute("data-workspace-expanded", "true")
            expect(drawing).to_have_attribute("aria-selected", "true")
            expect(drawing).to_be_focused()
            workspace.get_by_role("tab", name="3D structure", exact=True).click()
        else:
            page.keyboard.press("Escape")
            expect(expand).to_be_focused()
        expect(workspace).not_to_have_attribute("data-workspace-focus", "true")
        assert frame.evaluate("(node,original) => node === original", original)
        assert not writes and not errors, {"writes": writes, "errors": errors}
        assert {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)} == before
        assert pins.get(capability, verify=True) == pin
        browser.close()


@pytest.mark.parametrize("capability", ["gnina.dock", "p2rank.detect", "posebusters.check"])
@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_native_workspace_keeps_structure_controls_selection_and_downloads(
    restored_workspace, capability, language, width
):
    settings, store, pins = restored_workspace
    pin = pins.get(capability, verify=True)
    assert pin
    evidence = Path("outputs/workspace-fullscreen") / language / capability
    evidence.mkdir(parents=True, exist_ok=True)
    before = {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, writes = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#task=" + str(pin.job_id))
        workspace = page.locator(".structure-workbench").first
        viewer = workspace.locator(".viewer-panel").first
        export = viewer.get_by_role(
            "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓", exact=True
        )
        expect(export).to_be_enabled(timeout=45000)
        table = workspace.locator(".structure-workbench-details table").first
        selected = None

        def inspect():
            nonlocal selected
            expect(table).to_be_visible()
            if capability != "posebusters.check":
                row = table.locator("tbody tr").nth(1)
                row.scroll_into_view_if_needed()
                bounds = row.bounding_box()
                assert bounds
                (evidence / "selection-hit.json").write_text(
                    json.dumps(
                        page.evaluate(
                            """({x,y}) => ({x,y,
                    hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,600),
                    frame:[...document.querySelectorAll('.molecular-stage')].map(
                      el=>el.getBoundingClientRect().toJSON()),
                    workspace:[...document.querySelectorAll(
                      '.structure-workbench[data-workspace-expanded]')].map(el=>({
                      bounds:el.getBoundingClientRect().toJSON(),
                      rows:getComputedStyle(el).gridTemplateRows}))})""",
                            {
                                "x": bounds["x"] + bounds["width"] / 2,
                                "y": bounds["y"] + bounds["height"] / 2,
                            },
                        ),
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                row.click()
                expect(row).to_have_attribute("aria-selected", "true")
                selected = row.inner_text()
                expect(export).to_be_enabled(timeout=30000)
            else:
                figure = export_figure(
                    page, export, evidence, "native-fullscreen-quality", language
                )
                inspect_png(figure)

        geometry = inspect_full_workspace(
            page,
            viewer,
            evidence,
            language,
            "native",
            inspect,
            changes_source=capability != "posebusters.check",
        )
        if selected:
            expect(table.locator('tr[aria-selected="true"]')).to_have_text(
                selected, use_inner_text=True
            )
        assert not errors and not writes, {"errors": errors, "writes": writes}
        assert {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)} == before
        assert pins.get(capability, verify=True) == pin
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "capability": capability,
                    "source_job": str(pin.job_id),
                    "language": language,
                    "geometry": geometry,
                    "candidate_selection_kept": selected,
                    "new_scientific_tasks": 0,
                    "native_sources_unchanged": True,
                    "page_errors": errors,
                    "api_mutations": writes,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
