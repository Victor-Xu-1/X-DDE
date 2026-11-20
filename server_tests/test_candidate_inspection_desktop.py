"""Inspect actual retained candidate records without mutating runtime or scientific data."""

import hashlib
import json
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
])
def test_retained_screening_desktop(language, theme, width, height):
    settings = Settings.from_env()
    zh = language == "zh"
    evidence = Path("outputs/candidate-inspection") / f"screening-{language}"
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

        def readonly(route):
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
            _, root, result = load_case(page, base, capability, settings)
            workspace = page.locator("[data-screening-review] .structure-workbench")
            rail = workspace.locator(".structure-workbench-details")
            expect(rail.locator("tbody tr").first).to_be_visible()
            expect(rail.locator(".molecule-image")).to_have_count(0)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if capability in {"library.import", "drugclip.index"}:
                verify_library_member(page, workspace, base, zh, capability == "drugclip.index")
            else:
                verify_screening_candidate(page, workspace, root, result, zh)
            page.screenshot(path=evidence / f"{capability}.png")
        assert not writes
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()


def verify_screening_candidate(page, workspace, root, result, zh):
    left = workspace.locator(".structure-workbench-view")
    right = workspace.locator(".structure-workbench-details")
    frame = left.locator(".viewer-panel iframe:visible")
    capture = left.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
    expect(capture).to_be_enabled(timeout=35000)
    expect(frame).to_be_in_viewport(ratio=0.97)
    box, rail = frame.bounding_box(), right.bounding_box()
    assert box and rail and box["height"] >= 320 and box["x"] + box["width"] < rail["x"]

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
        label = "原始构象 MOL" if zh else "Original conformer MOL"
        capture = left.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
        expect(capture).to_be_enabled(timeout=35000)
        expect(left.locator(".viewer-panel iframe")).to_be_in_viewport(ratio=0.97)
    else:
        label = "原始结构 MOL" if zh else "Original structure MOL"
        drawing = left.locator('[data-drawing-state="ready"] .figure-preview-sheet')
        expect(drawing).to_be_in_viewport(ratio=0.97, timeout=35000)
    source = left.get_by_role("link", name=label, exact=True)
    expect(source).to_be_in_viewport(ratio=1)
    path = source.get_attribute("href")
    assert path and path.startswith("/api/datasets/") and "report_sha256=" in path
    expected = page.request.get(base + path)
    assert expected.ok
    with page.expect_download() as original:
        source.click()
    assert original.value.path().read_bytes() == expected.body()
