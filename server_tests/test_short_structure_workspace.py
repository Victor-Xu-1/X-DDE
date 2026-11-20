"""Inspect archived prediction and alignment on short desktop workspaces."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_archived_comparison_browser import read_camera


def open_result(page, base, capability):
    response = page.request.get(f"{base}/api/examples/{capability}?profile=stat6")
    assert response.ok
    job = response.json()["pin"]["job_id"]
    page.goto(f"{base}/#task={job}")
    return job


def inspect_canvas(frame, height, minimum):
    box = frame.bounding_box()
    assert box and box["width"] > 240 and box["height"] >= minimum
    assert box["y"] >= 0 and box["y"] + box["height"] <= height + 2
    return box


def inspect_prediction(page, base, width, height, zh, evidence):
    open_result(page, base, "predict")
    result = page.locator(".prediction-result")
    frame = result.locator(".structure-workbench .molecular-stage iframe")
    capture = result.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(capture).to_be_enabled(timeout=30000)
    metric = result.get_by_role("combobox", name="置信度视图" if zh else "Confidence view")
    matrix = result.locator(".confidence-panel .research-plot .main-svg").first
    expect(matrix).to_be_visible()
    assert metric.input_value() == "pae"
    canvas = inspect_canvas(frame, height, 340)
    chart = matrix.bounding_box()
    assert chart and chart["x"] > canvas["x"] + canvas["width"]
    assert chart["y"] + chart["height"] <= height + 2 and chart["height"] >= 240
    coloring = result.get_by_role("combobox", name="结构着色" if zh else "Structure coloring")
    settings = result.get_by_role("button", name="显示选项" if zh else "Display options")
    disclosed = settings.is_visible()
    if disclosed:
        settings.click()
    expect(coloring).to_have_value("confidence")
    original_camera = read_camera(frame)
    coloring.select_option("chain")
    expect(capture).to_be_enabled()
    assert read_camera(frame) == pytest.approx(original_camera, abs=1e-6)
    coloring.select_option("confidence")
    expect(capture).to_be_enabled()
    if disclosed:
        coloring.press("Escape")
    borders = result.get_by_role("checkbox", name="链边界" if zh else "Chain borders")
    original = borders.is_checked()
    borders.set_checked(not original)
    borders.set_checked(original)
    expect(result.get_by_role(
        "button", name="下载全部数据" if zh else "Download all data", exact=True,
    )).to_be_in_viewport()
    if width <= 1240:
        expect(result.locator(".prediction-archive-icon")).to_be_visible()
    page.screenshot(path=evidence / "prediction.png")
    return {"canvas": canvas, "confidence": chart}


def inspect_boltz_fallback(page, base, height, evidence):
    open_result(page, base, "boltz.predict")
    result = page.locator(".prediction-result")
    header = page.locator(".prediction-result-heading")
    expect(header.locator(".prediction-result-method")).to_contain_text("Boltz-2")
    expect(result.locator(".confidence-empty")).to_contain_text("No PAE matrix")
    capture = result.get_by_role("button", name="Capture 3D view", exact=True)
    expect(capture).to_be_enabled(timeout=30000)
    sample = result.get_by_role("button", name="Sample structure-002", exact=True)
    sample.click()
    expect(sample).to_have_attribute("aria-pressed", "true")
    expect(result.locator(".confidence-empty")).to_contain_text("structure-002")
    expect(capture).to_be_enabled(timeout=30000)
    iframe = result.locator(".molecular-stage iframe")
    canvas = inspect_canvas(iframe, height, 340)
    expect(header.get_by_role("button", name="Download all data", exact=True)).to_be_in_viewport()
    page.screenshot(path=evidence / "boltz.png")
    return canvas


def inspect_displacements(result, height):
    plot = result.locator(".comparison-analysis .research-plot-canvas")
    expect(plot).to_have_attribute("aria-busy", "false")
    box = plot.bounding_box()
    assert box and box["height"] >= 200
    assert box["y"] + box["height"] <= height + 2
    axis = plot.locator(".xtitle").bounding_box()
    legend = plot.locator(".legend").bounding_box()
    assert axis and legend and legend["y"] + legend["height"] < axis["y"]
    return box


def inspect_alignment(page, base, width, height, zh, evidence):
    job = open_result(page, base, "rmsd")
    result = page.locator(".comparison-result-view")
    capture = result.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(capture).to_be_enabled(timeout=30000)
    overlay = inspect_canvas(result.locator(".molecular-stage iframe"), height, 380)
    overlay_chart = inspect_displacements(result, height)
    pair = result.get_by_role(
        "button", name="已对齐并列" if zh else "Aligned side by side", exact=True,
    )
    pair.click()
    match = result.get_by_role("button", name="匹配视角" if zh else "Match views", exact=True)
    expect(match).to_be_enabled(timeout=45000)
    frames = result.locator(".aligned-structure-pair .molecular-stage iframe")
    boxes = [inspect_canvas(frame, height, 320) for frame in frames.all()]
    assert len(boxes) == 2
    left, right = boxes
    assert left["x"] + left["width"] < right["x"]
    assert abs(left["y"] - right["y"]) < 2 and abs(left["height"] - right["height"]) < 2
    paired_chart = inspect_displacements(result, height)
    result.get_by_role("button", name="放大" if zh else "Zoom in", exact=True).first.click()
    assert read_camera(frames.first) != pytest.approx(read_camera(frames.last), abs=1e-6)
    match.click()
    expect(match).to_be_enabled()
    matched = read_camera(frames.first)
    assert read_camera(frames.last) == pytest.approx(matched, abs=1e-6)
    overlay_mode = result.get_by_role(
        "button", name="已对齐叠合" if zh else "Aligned overlay", exact=True,
    )
    overlay_mode.click()
    expect(overlay_mode).to_have_attribute("aria-pressed", "true", timeout=15000)
    expect(frames).to_have_count(0)
    expect(capture).to_be_enabled(timeout=30000)
    pair.click()
    expect(match).to_be_enabled(timeout=45000)
    for frame in frames.all():
        assert read_camera(frame) == pytest.approx(matched, abs=1e-6)
    native = page.request.get(f"{base}/api/jobs/{job}/result").json()["artifact_sha256"]
    downloads = (
        ("reference-selected.cif", "下载参照结构 CIF", "Download Reference structure CIF"),
        ("moving-aligned.cif", "下载已对齐比较结构 CIF", "Download Aligned comparison CIF"),
    )
    for artifact, cn, en in downloads:
        button = result.get_by_role("button", name=cn if zh else en, exact=True)
        if width == 1280 and artifact == "reference-selected.cif":
            page.route(
                f"{base}/api/jobs/{job}/download?name={artifact}",
                lambda route: route.fulfill(content_type="chemical/x-cif", body="fixture mismatch"),
                times=1,
            )
            button.click()
            expect(result.get_by_role("alert").filter(
                has_text="Could not verify the saved file.",
            )).to_be_visible()
        with page.expect_download() as downloaded:
            button.click()
        data = Path(downloaded.value.path()).read_bytes()
        assert hashlib.sha256(data).hexdigest() == native[artifact]
    figure = result.get_by_role(
        "button", name="导出比较图 ↓" if zh else "Export comparison ↓", exact=True,
    )
    expect(figure).to_be_in_viewport()
    if width == 1280:
        inspect_png(export_figure(page, figure, evidence, "aligned-pair", "en"))
    page.screenshot(path=evidence / "alignment.png")
    return {"overlay": overlay, "pair": boxes, "overlay_chart": overlay_chart,
            "paired_chart": paired_chart}


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1180, 720), ("en", "warm", 1280, 720), ("zh", "dark", 1440, 800),
])
def test_short_desktop_structure_workspaces(language, theme, width, height):
    zh = language == "zh"
    evidence = Path("outputs/short-structure-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    settings = Settings.from_env()
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []
        page.route("**/api/**", lambda route: (
            route.continue_()
            if route.request.method in {"GET", "HEAD", "OPTIONS"}
            else (writes.append(route.request.url), route.abort())
        ))
        power_url = base + "/api/runtime-controls?include_native=false"
        before = page.request.get(power_url).json()
        observed = {
            "prediction": inspect_prediction(page, base, width, height, zh, evidence),
            "alignment": inspect_alignment(page, base, width, height, zh, evidence),
        }
        if width == 1280:
            observed["boltz"] = inspect_boltz_fallback(page, base, height, evidence)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert page.request.get(power_url).json() == before and not writes
        (evidence / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
