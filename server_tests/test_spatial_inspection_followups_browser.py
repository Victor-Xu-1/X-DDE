"""Retained native contact, quality, path and refinement workspaces on short desktops."""

import csv
import hashlib
import io
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg
from server_tests.test_short_structure_workspace import open_result
from server_tests.test_spatial_canvas_review_browser import ready, verify_download

CASES = [
    ("plip.profile", ".plip-result-workspace"),
    ("posebusters.check", ".quality-results"),
    ("caver.paths", ".channel-results"),
    ("openmm.refine", ".is-refinement-result"),
]


def geometry(result, height):
    canvas = result.locator(".molecular-stage iframe").bounding_box()
    analysis = result.locator(".structure-workbench-details").bounding_box()
    assert canvas and analysis
    assert canvas["height"] >= 370 and canvas["width"] >= 430
    assert canvas["y"] >= 0 and canvas["y"] + canvas["height"] <= height + 4
    assert canvas["x"] + canvas["width"] < analysis["x"]
    return canvas


def review_contacts(page, result, zh, evidence):
    table = result.locator(".research-table-scroll")
    assert table.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    heading = "端点距离（Å）" if zh else "Endpoint distance (Å)"
    expect(table.get_by_role("columnheader", name=heading)).to_be_in_viewport()
    first_distance = table.locator("tbody td.numeric-cell").first
    assert first_distance.evaluate("""cell => {
        const value = cell.getBoundingClientRect();
        const table = cell.closest(".research-table-scroll");
        return value.right <= table.getBoundingClientRect().left + table.clientWidth + 1;
    }""")
    source = "下载相互作用表" if zh else "Download interaction table"
    assert verify_download(page, result.get_by_role("link", name=source)) == "interactions.csv"
    search = result.get_by_role("searchbox")
    expect(search).to_be_in_viewport()
    search.fill("ARG562")
    row = table.locator("tbody tr")
    expect(row).to_have_count(1)
    row.click()
    expect(row).to_have_attribute("aria-selected", "true")
    selection = "当前结构选择" if zh else "Current structure selection"
    expect(result.get_by_role("group", name=selection)).to_contain_text("A:ARG562")
    if not zh:
        figure = result.locator(".viewer-panel .figure-export-trigger")
        inspect_png(export_figure(page, figure, evidence, "plip-contact", "en"))


def review_quality(page, result, zh):
    control = result.get_by_role("combobox", name="显示哪些检查？" if zh else "Which checks?")
    frame = result.locator(".molecular-stage iframe")
    native = frame.element_handle()
    expect(control).to_have_value("attention")
    rows = result.locator(".quality-checks tbody tr")
    expect(rows).to_have_count(6)
    expect(rows.first).to_be_in_viewport()
    control.select_option("all")
    expect(rows).to_have_count(22)
    control.select_option("unassessed")
    expect(rows).to_have_count(6)
    expand = result.locator("[data-workspace-expand]").first
    expand.click()
    workspace = result.locator(".structure-workbench")
    expect(workspace).to_have_attribute("data-workspace-expanded", "true")
    page.keyboard.press("Escape")
    expect(workspace).not_to_have_attribute("data-workspace-expanded", "true")
    expect(expand).to_be_focused()
    assert native.evaluate("frame => frame.isConnected")


def review_channel(page, result, zh, evidence):
    focus = result.get_by_role("button", name="定位通道" if zh else "Focus channel", exact=True)
    expect(focus).to_be_in_viewport()
    view_modes = result.locator(".viewer-mode-options > button")
    assert view_modes.count() > 0
    for control in view_modes.all():
        assert control.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    focus.click()
    clearance = result.get_by_role(
        "checkbox", name="显示采样空间" if zh else "Show sampled clearance", exact=True,
    )
    expect(clearance).to_be_in_viewport()
    clearance.uncheck()
    ready(result, zh)
    expect(clearance).not_to_be_checked()
    clearance.check()
    ready(result, zh)
    label = "下载三维坐标与半径" if zh else "Download coordinates and radii"
    assert verify_download(page, result.get_by_role("link", name=label)) == "channel-points.csv"
    if not zh:
        trigger = result.locator(".channel-profile .figure-export-trigger")
        export = export_figure(page, trigger, evidence, "channel-profile", "en", format="SVG")
        inspect_svg(export, "Radius (Å)")


def review_refinement(page, result, zh, original):
    summary = result.locator(".refinement-summary")
    expect(summary).to_be_in_viewport()
    download = "下载优化后结构" if zh else "Download refined structure"
    structure = summary.get_by_role("link", name=download)
    response = page.request.get(structure.evaluate("anchor => anchor.href"))
    output = original["candidates"][0]
    sha = original["artifact_sha256"][output["artifact"]]
    assert response.ok and hashlib.sha256(response.body()).hexdigest() == sha
    assert verify_download(page, structure) == output["artifact"]
    metrics = summary.get_by_role("button", name="导出指标 CSV" if zh else "Export metrics CSV")
    expect(metrics).to_be_in_viewport()
    with page.expect_download() as transfer:
        metrics.click()
    text = Path(transfer.value.path()).read_text(encoding="utf-8-sig")
    (exported,) = csv.DictReader(io.StringIO(text))
    for metric in output["metrics"]:
        label = metric["name"]
        if metric["unit"]:
            label += f' ({metric["unit"]})'
        assert float(exported[label]) == metric["value"]


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1120, 650), ("zh", "dark", 1280, 700),
])
def test_spatial_inspection_followups(language, theme, width, height):
    zh = language == "zh"
    evidence = Path("outputs/spatial-inspection-followups") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / "platform.log") as base,
        sync_playwright() as pw,
    ):
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""
            localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []
        page.route("**/api/**", lambda route: (
            route.continue_() if route.request.method in {"GET", "HEAD", "OPTIONS"}
            else (writes.append(route.request.url), route.abort())
        ))
        power_url = f"{base}/api/runtime-controls?include_native=false"
        power = page.request.get(power_url).json()
        observed = {}
        for capability, selector in CASES:
            job = open_result(page, base, capability)
            result = page.locator(".detail-panel " + selector)
            ready(result, zh)
            observed[capability] = geometry(result, height)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=evidence / f"{capability}.png")
            if capability == "plip.profile":
                review_contacts(page, result, zh, evidence)
            if capability == "posebusters.check":
                review_quality(page, result, zh)
            if capability == "caver.paths":
                review_channel(page, result, zh, evidence)
            if capability == "openmm.refine":
                native = page.request.get(f"{base}/api/jobs/{job}/result")
                assert native.ok
                review_refinement(page, result, zh, native.json())
        assert not writes and page.request.get(power_url).json() == power
        (evidence / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
