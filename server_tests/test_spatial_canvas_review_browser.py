"""Short desktop canvas, candidate navigation and original spatial outputs."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_apbs_range_browser import inspect_surface
from server_tests.test_short_structure_workspace import open_result

CASES = (
    ("gnina.dock", ".docking-results"),
    ("p2rank.detect", ".pocket-result-workspace"),
    ("biopython.exposure", ".surface-results"),
    ("apbs.potential", ".apbs-result"),
)


def ready(result, zh):
    capture = result.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
    expect(capture).to_be_enabled(timeout=45000)


def inspect_layout(result, height, minimum):
    scene = result.locator(".structure-workbench-view .molecular-stage iframe")
    view = scene.bounding_box()
    rail = result.locator(".structure-workbench-details").bounding_box()
    assert view and rail
    assert view["width"] >= 430 and view["height"] >= minimum
    assert 0 <= view["y"] and view["y"] + view["height"] <= height + 2
    assert view["x"] + view["width"] < rail["x"]
    bar = result.locator(".structure-workbench-toolbar")
    if bar.count():
        switcher = bar.bounding_box()
        assert switcher and abs(switcher["x"] - rail["x"]) < 2
        assert switcher["y"] < view["y"]
    table = result.locator(".structure-workbench-details .research-table").first
    if table.count():
        toolbar = table.locator(".research-table-toolbar").bounding_box()
        assert toolbar and toolbar["height"] < 65
        expect(table.locator("tbody tr").first).to_be_in_viewport()
    return view


def verify_download(page, link):
    response = page.request.get(link.evaluate("anchor => anchor.href"))
    assert response.ok
    expect(link).to_be_in_viewport()
    with page.expect_download() as pending:
        link.click()
    artifact = pending.value
    assert Path(artifact.path()).read_bytes() == response.body()
    return artifact.suggested_filename


def next_candidate(result, zh):
    button = result.get_by_role("button", name="下一个候选" if zh else "Next candidate")
    expect(button).to_be_in_viewport()
    button.click()


def review_docking(page, result, zh):
    next_candidate(result, zh)
    chosen = result.get_by_role("button", name="预览姿势 2" if zh else "Preview pose 2")
    expect(chosen).to_have_attribute("aria-pressed", "true")
    ready(result, zh)
    preview = result.locator(".molecular-preview")
    tabs = preview.get_by_role("tablist")
    frame = preview.locator(".molecular-stage iframe").element_handle()
    tabs.get_by_role("tab", name="二维结构" if zh else "2D structure").click()
    expect(preview.locator(".molecular-stage iframe")).to_be_hidden()
    tabs.get_by_role("tab", name="三维结构" if zh else "3D structure").click()
    assert frame.evaluate("el => el.isConnected")
    ready(result, zh)
    artifact = verify_download(page, result.get_by_role(
        "link", name="下载所选姿势 SDF" if zh else "Download selected pose SDF",
    ))
    assert artifact == "pose-002.sdf"
    review_docking_comparison(result, zh)


def review_docking_comparison(result, zh):
    for index in (1, 2):
        label = ("对比 姿势 " if zh else "Compare Pose ") + str(index)
        result.get_by_role("checkbox", name=label, exact=True).check()
    label = "三维比较两个姿势" if zh else "Compare two poses in 3D"
    result.get_by_role("button", name=label, exact=True).click()
    comparison = result.locator(".pose-comparison")
    ready(comparison, zh)
    # The wider viewport uses the existing 1180 px comparison stage layout.
    expect(comparison.locator(".molecular-stage")).to_have_css(
        "height", "365px" if zh else "520px",
    )
    close = "返回单个姿势" if zh else "Return to single pose"
    comparison.get_by_role("button", name=close, exact=True).click()
    expect(comparison).to_have_count(0)
    ready(result, zh)


def review_pocket(result, zh):
    next_candidate(result, zh)
    chosen = result.get_by_role("button", name="预览口袋 2" if zh else "Preview pocket 2")
    expect(chosen).to_have_attribute("aria-pressed", "true")
    expect(result.locator(".pocket-selection h3")).to_have_text("口袋 2" if zh else "Pocket 2")
    expect(result.locator(".pocket-scene .viewer-panel")).to_contain_text(
        "10 / 10",
    )
    summary = result.locator(".viewer-chain-menu summary")
    summary.click()
    focus = result.locator(".viewer-chain-list > div").first.get_by_role(
        "button", name="定位链 A" if zh else "Focus chain A",
    )
    expect(focus).to_be_in_viewport()
    focus.click()
    summary.click()


def review_surface(page, result, zh):
    frame = result.locator(".molecular-stage iframe")
    frame.evaluate("""frame => {
        const preview = frame.contentWindow;
        preview.spatialResidue = null;
        preview.addEventListener("message", event => {
            if (event.source === window && event.data?.channel === "opendde-viewer"
                && event.data.type === "residue")
                preview.spatialResidue = event.data.value;
        });
    }""")
    result.get_by_role("tab", name="按区域" if zh else "By region").click()
    row = result.locator(".research-table tbody .record-select").first
    expect(row).to_be_in_viewport()
    row.click()
    expect(row).to_have_attribute("aria-pressed", "true")
    page.wait_for_function("""() => {
        const frame = document.querySelector(".surface-results .molecular-stage iframe");
        return Boolean(frame?.contentWindow.spatialResidue);
    }""")
    result.get_by_role("tab", name="按原子" if zh else "By atom").click()
    expect(result.locator(".research-table tbody tr").first).to_be_in_viewport()
    label = "下载原子面积" if zh else "Download atom areas"
    verify_download(page, result.get_by_role("link", name=label))


def review_potential(page, result, zh, evidence):
    legend = result.locator(".potential-legend")
    expect(legend).to_contain_text("+5 kBT/e")
    frame = result.locator(".molecular-stage iframe")
    before = inspect_surface(frame, remember=True)
    select = result.get_by_role("combobox", name="颜色范围" if zh else "Color range")
    expect(select).to_be_in_viewport()
    select.select_option("10")
    expect(legend).to_contain_text("+10 kBT/e")
    ready(result, zh)
    after = inspect_surface(frame)
    assert after["sameGeometry"] and after["camera"] == before["camera"]
    assert after["png"] != before["png"]
    label = "下载电势网格" if zh else "Download potential grid"
    verify_download(page, result.get_by_role("link", name=label))
    if not zh:
        figure = result.locator(".figure-export-trigger")
        png = export_figure(page, figure, evidence, "apbs", "en")
        inspect_png(png)


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1120, 650), ("zh", "dark", 1280, 700),
])
def test_spatial_canvas_review(language, theme, width, height):
    zh = language == "zh"
    evidence = Path("outputs/spatial-canvas-review") / f"{language}-{width}"
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
            open_result(page, base, capability)
            result = page.locator(".detail-panel " + selector)
            ready(result, zh)
            minimum = 370 if capability == "gnina.dock" else 400
            observed[capability] = inspect_layout(result, height, minimum)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=evidence / f"{capability}.png")
            if capability == "gnina.dock":
                review_docking(page, result, zh)
            if capability == "p2rank.detect":
                review_pocket(result, zh)
            if capability == "biopython.exposure":
                review_surface(page, result, zh)
            if capability == "apbs.potential":
                review_potential(page, result, zh, evidence)
        assert not writes and page.request.get(power_url).json() == power
        (evidence / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
