"""Inspect archived prediction and alignment on short desktop workspaces."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
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


def inspect_prediction(page, base, height, zh, evidence):
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
    canvas = inspect_canvas(frame, height, 355)
    chart = matrix.bounding_box()
    assert chart and chart["x"] > canvas["x"] + canvas["width"]
    assert chart["y"] + chart["height"] <= height + 2 and chart["height"] >= 240
    coloring = result.get_by_role("combobox", name="结构着色" if zh else "Structure coloring")
    expect(coloring).to_have_value("confidence")
    original_camera = read_camera(frame)
    coloring.select_option("chain")
    expect(capture).to_be_enabled()
    assert read_camera(frame) == pytest.approx(original_camera, abs=1e-6)
    coloring.select_option("confidence")
    expect(capture).to_be_enabled()
    borders = result.get_by_role("checkbox", name="链边界" if zh else "Chain borders")
    original = borders.is_checked()
    borders.set_checked(not original)
    borders.set_checked(original)
    expect(result.get_by_role(
        "button", name="下载全部数据" if zh else "Download all data", exact=True,
    )).to_be_in_viewport()
    page.screenshot(path=evidence / "prediction.png")
    return {"canvas": canvas, "confidence": chart}


def inspect_alignment(page, base, height, zh, evidence):
    job = open_result(page, base, "rmsd")
    result = page.locator(".comparison-result-view")
    capture = result.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(capture).to_be_enabled(timeout=30000)
    overlay = inspect_canvas(result.locator(".molecular-stage iframe"), height, 380)
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
    match.click()
    expect(match).to_be_enabled()
    assert read_camera(frames.first) == pytest.approx(read_camera(frames.last), abs=1e-6)
    native = page.request.get(f"{base}/api/jobs/{job}/result").json()["artifact_sha256"]
    with page.expect_download() as downloaded:
        result.get_by_role(
            "button", name="下载参照结构 CIF" if zh else "Download Reference structure CIF",
            exact=True,
        ).click()
    data = Path(downloaded.value.path()).read_bytes()
    assert hashlib.sha256(data).hexdigest() == native["reference-selected.cif"]
    expect(result.get_by_role(
        "button", name="导出比较图 ↓" if zh else "Export comparison ↓", exact=True,
    )).to_be_in_viewport()
    page.screenshot(path=evidence / "alignment.png")
    return {"overlay": overlay, "pair": boxes}


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1280, 720), ("zh", "dark", 1440, 800),
])
def test_short_desktop_structure_workspaces(language, theme, width, height):
    zh = language == "zh"
    evidence = Path("outputs/short-structure-workspace") / language
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
            "prediction": inspect_prediction(page, base, height, zh, evidence),
            "alignment": inspect_alignment(page, base, height, zh, evidence),
        }
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert page.request.get(power_url).json() == before and not writes
        (evidence / "layout.json").write_text(json.dumps(observed, indent=2), encoding="utf-8")
        browser.close()
