"""Inspect actual retained candidate records without mutating runtime or scientific data."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.chemistry.sdf_io import RECORD_END
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

CASES = (
    "drugclip.screen", "screening.dock", "del.candidates", "diffsbdd.generate",
    "diffsbdd.optimize",
)


def load_case(page, base, capability, settings):
    example = page.request.get(f"{base}/api/examples/{capability}")
    assert example.ok
    pin = example.json()["pin"]
    assert pin
    job = pin["job_id"]
    root = settings.state_dir / "jobs" / job / "output"
    page.goto(f"{base}/#task={job}")
    result = json.loads((root / "result.json").read_bytes())
    return job, root, result


def canvas_bounds(workbench, width, height):
    frame = workbench.locator(".structure-workbench-view .viewer-panel iframe:visible")
    figure = workbench.locator(".structure-workbench-view .figure-export-trigger:visible")
    expect(figure).to_be_enabled(timeout=35000)
    box = frame.bounding_box()
    details = workbench.locator(":scope > .structure-workbench-details").bounding_box()
    assert box and details
    assert box["width"] >= 545 and box["height"] >= 395 and 0 < box["y"] <= 410
    assert box["x"] + box["width"] < details["x"]
    assert details["x"] + details["width"] <= width + 1 and box["y"] < height
    return frame, figure, box


def exact_frame(frame, candidate, artifact, binding):
    record = candidate["record"]
    loads = frame.content_frame.locator("html")
    expect(loads).to_have_attribute("data-load-record", str(record), timeout=12000)
    payload = loads.evaluate("() => window.__candidateLoad")
    assert payload["urls"][-1].endswith("name=" + candidate["artifact"])
    assert payload["records"][-1] == record
    if binding:
        assert len(payload["urls"]) == 2 and payload["urls"][0].endswith("name=receptor.pdb")
    else:
        assert len(payload["urls"]) == 1
        assert payload["expectedStructureSha256"] == artifact["sha256"]
        assert payload["initialPosePrepared"] is True


def selected_download(page, workbench, root, candidate, zh):
    action = workbench.get_by_role(
        "link", name="下载原始结果结构" if zh else "Download original result structure", exact=True
    )
    expect(action).to_be_in_viewport(ratio=1)
    raw = (root / candidate["artifact"]).read_bytes()
    ends = [0, *(match.end() for match in RECORD_END.finditer(raw))]
    expected = raw[ends[candidate["record"]] : ends[candidate["record"] + 1]]
    with page.expect_download() as candidate_sdf:
        action.click()
    assert candidate_sdf.value.path().read_bytes() == expected
    return hashlib.sha256(expected).hexdigest()


def dataset_candidate(page, workbench, frame, ready, root, result, capability, zh):
    table = workbench.locator(".dataset-candidate-table .research-table-scroll")
    expect(table.locator("tbody tr").first).to_be_in_viewport(ratio=0.75)
    assert table.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    initial = next(row for row in result["candidates"] if row.get("artifact"))
    binding = capability == "screening.dock"
    artifact = next(row for row in result["artifacts"] if row["name"] == initial["artifact"])
    exact_frame(frame, initial, artifact, binding)
    digest = selected_download(page, workbench, root, initial, zh)
    selected = next(
        row for row in result["candidates"]
        if row.get("artifact") == initial["artifact"]
        and row["record"] != initial["record"] and row["geometry"] == initial["geometry"]
    )
    if capability == "del.candidates":
        disclosure = workbench.locator(".candidate-evidence-disclosure")
        expect(disclosure).not_to_have_attribute("open", "")
        disclosure.locator("summary").press("Enter")
        expect(disclosure.locator(".dataset-candidate-evidence dl")).to_be_visible()
    selected_name = selected.get("display_name") or selected["id"]
    workbench.get_by_role("button", name=selected_name, exact=True).click()
    expect(ready).to_be_enabled(timeout=35000)
    exact_frame(frame, selected, artifact, binding)
    if capability == "del.candidates":
        expect(disclosure).to_have_attribute("open", "")
        expect(disclosure.locator(".dataset-candidate-evidence dl")).to_be_visible()
    controls = workbench.locator(".molecular-preview")
    tab_2d = "二维结构" if zh else "2D structure"
    tab_3d = "三维结构" if zh else "3D structure"
    controls.get_by_role("tab", name=tab_2d, exact=True).press("Enter")
    image = controls.locator('[role="tabpanel"]:visible [data-drawing-state="ready"] img')
    expect(image).to_be_visible(timeout=30000)
    controls.get_by_role("tab", name=tab_3d, exact=True).press("Enter")
    expect(ready).to_be_enabled(timeout=35000)
    exact_frame(frame, selected, artifact, binding)
    return digest


def generated_candidate(workbench, frame, ready):
    rail = workbench.locator(".generated-candidate-navigation")
    box = frame.bounding_box()
    dock = rail.bounding_box()
    assert box and dock and dock["x"] >= box["x"] + box["width"]
    before = frame.content_frame.locator("html").get_attribute("data-load-record")
    tabs = rail.locator("button[aria-pressed]")
    assert tabs.count() >= 2
    next_row = tabs.nth(1)
    next_row.press("Enter")
    expect(next_row).to_have_attribute("aria-pressed", "true")
    expect(ready).to_be_enabled(timeout=35000)
    expect(frame.content_frame.locator("html")).not_to_have_attribute("data-load-record", before)


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1280, 720),
    ("zh", "dark", 1600, 900),
])
def test_retained_candidate_desktop_workspaces(language, theme, width, height):
    settings = Settings.from_env()
    zh = language == "zh"
    evidence = Path("outputs/candidate-inspection") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
          localStorage.setItem('x-dde-theme', '{theme}');
          window.addEventListener('message', event => {{
            if (event.origin === location.origin && event.source === window.parent &&
                event.data?.channel === 'opendde-viewer' && event.data.type === 'load') {{
              window.__candidateLoad = structuredClone(event.data.value);
              const record = event.data.value.records?.at(-1);
              document.documentElement.dataset.loadRecord = String(record);
            }}
          }});""")
        writes = []

        def readonly(route):
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", readonly)
        runtime = f"{base}/api/runtime-controls?include_native=false"
        before = page.request.get(runtime).json()
        rows = []
        for capability in CASES:
            job, root, result = load_case(page, base, capability, settings)
            generated = capability.startswith("diffsbdd.")
            marker = (
                ".generated-candidate-navigation" if generated else ".candidate-inspection-preview"
            )
            workbench = page.locator(".structure-workbench").filter(has=page.locator(marker))
            frame, figure, box = canvas_bounds(workbench, width, height)
            expect(workbench).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=evidence / f"{capability}.png")
            if generated:
                generated_candidate(workbench, frame, figure)
                digest = None
            else:
                digest = dataset_candidate(
                    page, workbench, frame, figure, root, result, capability, zh
                )
            if not zh and capability == "screening.dock":
                inspect_png(export_figure(page, figure, evidence, "screening-figure", language))
            rows.append({"capability": capability, "job": job, "view": box, "sdf_sha256": digest})
        assert not writes
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        (evidence / "receipt.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        browser.close()


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1120, 650),
    ("zh", "dark", 1280, 700),
    ("en", "warm", 1001, 600),
    ("zh", "dark", 1024, 600),
])
def test_retained_screening_desktop(language, theme, width, height):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    zh = language == "zh"
    evidence = Path("outputs/candidate-inspection") / f"screening-{language}-{width}x{height}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"""
            localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []
        allowed_preserve = None
        preserves = []

        def readonly(route):
            if route.request.url == allowed_preserve and route.request.method == "POST":
                preserves.append(route.request.url)
                route.continue_()
                return
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", readonly)
        runtime = f"{base}/api/runtime-controls?include_native=false"
        before = page.request.get(runtime).json()
        cases = (
            "drugclip.screen", "screening.dock", "library.select", "library.import",
            "drugclip.index",
        )
        for capability in cases:
            job, root, result = load_case(page, base, capability, settings)
            workspace = page.locator("[data-screening-review] .structure-workbench")
            rail = workspace.locator(".structure-workbench-details")
            expect(rail.locator("tbody tr").first).to_be_visible()
            expect(rail.locator(".molecule-image")).to_have_count(0)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if height == 600:
                page.evaluate("window.scrollTo(0, 0)")
                page.screenshot(path=evidence / f"{capability}-first-screen.png")
                verify_short_screening_first_screen(
                    workspace, height, zh, two_dimensional=capability == "library.import"
                )
                page.evaluate("window.scrollTo(0, 0)")
            if capability in {"library.import", "drugclip.index"}:
                verify_library_member(page, workspace, base, zh, capability == "drugclip.index")
                if capability == "drugclip.index":
                    if height == 600:
                        verify_index_source_after_filter(page, workspace, zh)
                    allowed_preserve = f"{base}/api/datasets/{job}/members/preserve"
                    verify_index_preservation(page, workspace, allowed_preserve, zh)
                    allowed_preserve = None
            else:
                verify_screening_candidate(page, workspace, root, result, zh, height)
            page.screenshot(path=evidence / f"{capability}.png")
        assert not writes
        assert len(preserves) == 1
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()


def verify_short_screening_first_screen(workspace, height, zh, *, two_dimensional):
    right = workspace.locator(".structure-workbench-details")
    counts = right.locator(".dataset-result-counts")
    downloads = right.locator(".dataset-download-menu")
    count_toggle = counts.locator(":scope > summary")
    download_toggle = downloads.locator(":scope > summary")
    first = right.locator("tbody tr").first
    a, b, row = count_toggle.bounding_box(), download_toggle.bounding_box(), first.bounding_box()
    assert a and b and row
    assert abs(a["y"] - b["y"]) <= 3
    assert row["y"] + row["height"] <= height + 1
    verify_short_screening_preview(workspace, zh, two_dimensional)
    count_toggle.press("Space")
    expect(counts).to_have_attribute("open", "")
    expect(counts.locator(".dataset-count-values strong").first).to_be_visible()
    count_toggle.press("Space")
    expect(counts).not_to_have_attribute("open", "")
    download_toggle.press("Enter")
    expect(downloads).to_have_attribute("open", "")
    assert downloads.locator("a[href]").count() > 0
    download_toggle.press("Enter")


def verify_short_screening_preview(workspace, zh, two_dimensional):
    left = workspace.locator(".structure-workbench-view")
    if not two_dimensional:
        frame = left.locator(".molecular-stage iframe")
        expect(frame).to_be_in_viewport(ratio=0.99)
        box = frame.bounding_box()
        assert box and box["height"] >= 290
        return
    drawing = left.locator(".figure-preview-sheet")
    expect(drawing).to_be_in_viewport(ratio=0.99)
    dimensions = drawing.bounding_box()
    assert dimensions and dimensions["height"] >= 245
    expect(left.locator(".figure-export-trigger")).to_be_in_viewport(ratio=0.99)
    line_weight = "二维图线条粗细" if zh else "2D drawing line weight"
    expect(left.get_by_role("combobox", name=line_weight)).to_be_in_viewport(ratio=0.99)
    zoom = left.get_by_role("button", name="放大预览" if zh else "Zoom in preview")
    expect(zoom).to_be_in_viewport(ratio=0.99)
    zoom.click()
    expect(drawing).to_have_attribute("data-zoom", "2")
    left.get_by_role("button", name="适应窗口" if zh else "Fit preview").click()


def verify_screening_candidate(page, workspace, root, result, zh, height):
    left = workspace.locator(".structure-workbench-view")
    right = workspace.locator(".structure-workbench-details")
    frame = left.locator(".viewer-panel iframe:visible")
    capture = left.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
    expect(capture).to_be_enabled(timeout=35000)
    expect(frame).to_be_in_viewport(ratio=0.97)
    box, rail = frame.bounding_box(), right.bounding_box()
    minimum = 290 if height == 600 else 320
    assert box and rail and box["height"] >= minimum and box["x"] + box["width"] < rail["x"]

    original = next(row for row in result["candidates"] if row.get("artifact"))
    selected_download(page, workspace, root, original, zh)
    alternative = next(
        row for row in result["candidates"]
        if row.get("artifact") and row["id"] != original["id"]
    )
    name = alternative.get("display_name") or alternative["id"]
    search = right.get_by_role("searchbox")
    search.fill(name)
    right.get_by_role("button", name=name, exact=True).click()
    expect(search).to_have_value(name)
    expect(capture).to_be_enabled(timeout=35000)
    selected_download(page, workspace, root, alternative, zh)


def verify_library_member(page, workspace, base, zh, native_3d):
    left = workspace.locator(".structure-workbench-view")
    if native_3d:
        capture = left.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
        expect(capture).to_be_enabled(timeout=35000)
        expect(left.locator(".viewer-panel iframe")).to_be_in_viewport(ratio=0.97)
    else:
        drawing = left.locator('[data-drawing-state="ready"] .figure-preview-sheet')
        expect(drawing).to_be_in_viewport(ratio=0.97, timeout=35000)
    label = "下载 MOL" if zh else "Download MOL"
    source = left.get_by_role("link", name=label, exact=True)
    expect(source).to_be_in_viewport(ratio=1)
    path = source.get_attribute("href")
    assert path and path.startswith("/api/datasets/") and "report_sha256=" in path
    expected = page.request.get(base + path)
    assert expected.ok
    with page.expect_download() as original:
        source.click()
    assert original.value.path().read_bytes() == expected.body()


def verify_index_preservation(page, workspace, endpoint, zh):
    left = workspace.locator(".structure-workbench-view")
    frame = left.locator(".viewer-panel iframe")
    camera = frame.element_handle()
    assert camera
    action = left.get_by_role("button", name="保存文件" if zh else "Save file", exact=True)
    expect(action).to_be_in_viewport(ratio=1)
    with page.expect_response(endpoint) as preserve:
        action.click()
    assert preserve.value.ok, preserve.value.status
    expect(left.get_by_text(
        "已保存到历史文件" if zh else "Saved to historical files", exact=True
    )).to_be_visible()
    capture = left.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
    expect(capture).to_be_enabled()
    expect(frame).to_be_in_viewport(ratio=0.97)
    assert frame.evaluate("(current, original) => current === original", camera)


def verify_index_source_after_filter(page, workspace, zh):
    right = workspace.locator(".structure-workbench-details")
    rows = right.locator("tbody tr")
    supplier = rows.first.locator(".dataset-column-supplier").inner_text()
    search = right.get_by_role("searchbox")
    search.fill("no-result-screening-source-check")
    expect(rows).to_have_count(0)
    help_label = "来源与构象" if zh else "Source and conformer"
    help_button = workspace.get_by_role("button", name=help_label)
    help_button.focus()
    expect(page.get_by_role("tooltip")).to_contain_text(supplier)
    help_button.press("Escape")
    search.clear()
    expect(rows.first).to_be_visible()
