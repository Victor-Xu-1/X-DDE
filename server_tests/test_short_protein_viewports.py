"""Exercise the three structure workspaces at short desktop heights."""

import hashlib
import json
import struct
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_archived_comparison_browser import read_camera
from server_tests.test_short_structure_workspace import open_result

VIEW = ".structure-workbench-view"
SCENE = ".molecular-stage iframe"


def canvas_in_workspace(result, scene, height, minimum, width):
    canvas = scene.bounding_box()
    rail = result.locator(".structure-workbench-details").bounding_box()
    assert canvas and rail and canvas["width"] >= width and canvas["height"] >= minimum
    assert canvas["x"] + canvas["width"] < rail["x"]
    assert canvas["y"] >= 0 and canvas["y"] + canvas["height"] <= height + 8
    return canvas


def ready(result, zh):
    name = "生成三维视图图片" if zh else "Capture 3D view"
    expect(result.get_by_role("button", name=name, exact=True).first).to_be_enabled(timeout=45000)
    return result.locator(f"{VIEW} {SCENE}")


def inspect_interface(page, base, height, zh, evidence):
    open_result(page, base, "structure")
    result = page.locator(".detail-panel .protein-interface-results")
    scene = ready(result, zh)
    box = canvas_in_workspace(result, scene, height, 350, 455)
    contact = result.locator(".interface-residue-button:enabled").first
    expect(contact).to_be_in_viewport()
    contact.click()
    expect(contact).to_have_attribute("aria-pressed", "true")
    expect(result.locator(".interface-summary")).to_be_in_viewport()
    page.screenshot(path=evidence / "protein-interface.png")
    return box


def inspect_comparison(page, base, height, zh, evidence):
    job = open_result(page, base, "rmsd")
    result = page.locator(".detail-panel .comparison-result-view")
    compact = page.viewport_size["width"] < 1080
    overlay = canvas_in_workspace(
        result, ready(result, zh), height, 300 if compact else 350, 400 if compact else 455
    )
    tabs = result.locator(".comparison-analysis .research-tab-list")
    assert tabs.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    pair = result.get_by_role("button", name="已对齐并列" if zh else "Aligned side by side")
    pair.click()
    match = result.get_by_role("button", name="匹配视角" if zh else "Match views")
    expect(match).to_be_enabled(timeout=45000)
    expect(match).to_be_in_viewport()
    frames = result.locator(".aligned-structure-pair " + SCENE)
    expect(frames).to_have_count(2)
    a, b = frames.first, frames.last
    left, right = (
        canvas_in_workspace(result, item, height, 230 if compact else 310, 200 if compact else 220)
        for item in (a, b)
    )
    assert abs(left["y"] - right["y"]) < 2 and left["x"] + left["width"] < right["x"]
    assert abs(left["width"] - right["width"]) < 2
    page.screenshot(path=evidence / "paired-first-screen.png")
    handles = [a.element_handle(), b.element_handle()]
    expand = result.locator(".comparison-view-actions [data-workspace-expand]")
    expand.click()
    expect(result.locator('[data-workspace-expanded="true"]')).to_be_visible()
    expand.click()
    expect(result.locator('[data-workspace-expanded="true"]')).to_have_count(0)
    assert all(handle.evaluate("el => el.isConnected") for handle in handles)
    if compact:
        zoom_before = read_camera(a)[3]
        result.locator(".aligned-structure-pair > section").first.get_by_role(
            "button", name="放大" if zh else "Zoom in", exact=True
        ).click()
        page.wait_for_function("""initial => {
            const frame = document.querySelector('.aligned-structure-pair .molecular-stage iframe');
            const view = frame?.contentDocument.querySelector('canvas')?._3dmol_viewer;
            return view && Math.abs(view.getView()[3] - initial) > 0.01;
        }""", arg=zoom_before)
    match.click()
    expect(match).to_be_enabled()
    page.wait_for_function("""() => {
        const frames = [...document.querySelectorAll('.aligned-structure-pair iframe')];
        if (frames.length !== 2) return false;
        const views = frames.map(f => f.contentDocument.querySelector('canvas')
            ?._3dmol_viewer?.getView());
        return views.every(Boolean) && views[0].every((v, i) => Math.abs(v - views[1][i]) < 1e-6);
    }""")
    assert read_camera(a) == pytest.approx(read_camera(b), abs=1e-6)
    menus = result.locator(".aligned-structure-pair .viewer-chain-menu")
    label = menus.first.locator("summary")
    other = menus.last.locator("summary")
    label.click()
    checkbox = menus.first.get_by_role("checkbox").first
    expect(checkbox).to_be_in_viewport()
    # The parent updates the checked state on the molecular frame's reply.
    checkbox.click()
    expect(label).to_contain_text("1 / 2")
    expect(checkbox).not_to_be_checked()
    expect(other).to_contain_text("2 / 2")
    checkbox.click()
    expect(label).to_contain_text("2 / 2")
    expect(checkbox).to_be_checked()
    label.click()
    if compact or not zh:
        source = page.request.get(f"{base}/api/jobs/{job}/result").json()["artifact_sha256"]
        for label, name in (
            ("下载参照结构 CIF" if zh else "Download Reference structure CIF",
             "reference-selected.cif"),
            ("下载已对齐比较结构 CIF" if zh else "Download Aligned comparison CIF",
             "moving-aligned.cif"),
        ):
            button = result.get_by_role("button", name=label, exact=True)
            expect(button).to_be_in_viewport()
            with page.expect_download() as downloaded:
                button.click()
            contents = Path(downloaded.value.path()).read_bytes()
            assert hashlib.sha256(contents).hexdigest() == source[name]
        figure = result.get_by_role(
            "button", name="导出比较图 ↓" if zh else "Export comparison ↓", exact=True
        )
        expect(figure).to_be_in_viewport()
        png = export_figure(page, figure, evidence, "comparison", "zh" if zh else "en")
        inspect_png(png)
        assert struct.unpack(">II", png.read_bytes()[16:24]) == (2102, 1051)
    page.screenshot(path=evidence / "aligned-comparison.png")
    return {"overlay": overlay, "pair": [left, right]}


def inspect_receptors(page, base, height, zh, evidence):
    open_result(page, base, "biopython.ensemble")
    result = page.locator(".detail-panel .receptor-results")
    scene = ready(result, zh)
    box = canvas_in_workspace(result, scene, height, 350, 455)
    selected = result.get_by_role("combobox", name="预览受体" if zh else "Preview receptor")
    overlay = result.get_by_role("button", name="叠合参照" if zh else "Overlay reference")
    selected.select_option("0")
    expect(overlay).to_be_disabled()
    selected.select_option("1")
    expect(overlay).to_be_enabled()
    expect(overlay).to_have_attribute("aria-pressed", "true")
    overlay.click()
    expect(overlay).to_have_attribute("aria-pressed", "false")
    overlay.click()
    expect(overlay).to_have_attribute("aria-pressed", "true")
    ready(result, zh)
    expect(result.locator(".ensemble-result-list")).to_be_in_viewport()
    expect(selected).to_have_value("1")
    page.screenshot(path=evidence / "receptor-ensemble.png")
    return box


@pytest.mark.parametrize(("language", "theme", "width", "height", "kinds"), [
    ("en", "warm", 1120, 650, ("interface", "comparison", "receptors")),
    ("zh", "dark", 1280, 700, ("interface", "comparison", "receptors")),
    pytest.param("en", "warm", 1001, 600, ("comparison",), id="paired_short_en"),
    pytest.param("zh", "dark", 1001, 580, ("comparison",), id="paired_short_zh"),
])
def test_short_protein_viewports(language, theme, width, height, kinds):
    zh = language == "zh"
    evidence = Path("outputs/short-protein-viewports") / f"{language}-{width}-{height}"
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
        power_url = base + "/api/runtime-controls?include_native=false"
        power = page.request.get(power_url).json()
        inspectors = {
            "interface": inspect_interface,
            "comparison": inspect_comparison,
            "receptors": inspect_receptors,
        }
        observed = {kind: inspectors[kind](page, base, height, zh, evidence) for kind in kinds}
        assert not writes and page.request.get(power_url).json() == power
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        (evidence / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
