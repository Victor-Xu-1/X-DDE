"""Replay retained ADMET and library results through the desktop inspection UI."""

import csv
import hashlib
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256
from opendde_workbench.examples.stat6_bundle_release import SHA256 as STAT6_SHA256
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform

ADMET = "9699cfec-c574-40da-8ede-cec190d199c5"
LIBRARY = "b4db0db0-c238-42b3-8ee9-6ca0e4cb1f40"
PROPERTIES = "5c35e148-cb26-4e46-b5ab-2231e228ccea"
RETAINED_3D_PROPERTIES = (
    "b9cbb1ad-1d0d-4c87-802d-9a2d2f775504",
    "d5aba1ec-246a-4226-96b8-92648597c38b",
)
DRAWING_TIMEOUT_MS = 35000


def require_no_horizontal_truncation(locator):
    assert locator.evaluate("(el) => el.scrollWidth <= el.clientWidth + 1")


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1280, 800),
    ("zh", 1600, 900),
])
def test_desktop_result_handoffs_preserve_native_identity(
    tmp_path, monkeypatch, language, width, height,
):
    zh = language == "zh"
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_RETAINED_UTILITY"]), settings, SHA256)
    configuration = Path(os.environ["WB_UTILITY_GRAPHICS"]).read_bytes()
    (settings.state_dir / "deployment.json").write_bytes(configuration)
    evidence = Path("outputs/result-handoffs-desktop") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "server.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        writes = []

        def read_only(route):
            if route.request.method in ("GET", "HEAD"):
                route.continue_()
            else:
                writes.append((route.request.method, route.request.url))
                route.abort()

        page.route("**/api/**", read_only)
        verify_library(page, base, height, zh, evidence)
        verify_admet(page, base, zh, evidence)
        verify_descriptors(page, base, zh, evidence)
        assert not writes
        browser.close()


def verify_library(page, base, height, zh, evidence):
    native = page.request.get(f"{base}/api/jobs/{LIBRARY}/result").json()
    page.goto(f"{base}/#task={LIBRARY}")
    selection = page.locator(".library-screen-selection")
    drawing = selection.locator(".molecule-image[data-drawing-state=ready] img")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    canvas = selection.bounding_box()
    records = page.locator(".library-screen-records")
    table = records.bounding_box()
    assert canvas["width"] >= 460 and canvas["x"] + canvas["width"] <= table["x"] + 2
    assert canvas["y"] < height and table["y"] < height
    require_no_horizontal_truncation(records)
    thickness = selection.get_by_role(
        "combobox", name="二维图线条粗细" if zh else "2D drawing line weight"
    )
    thickness.select_option("2.2")
    original = drawing.get_attribute("src")
    original_label = drawing.get_attribute("alt")
    row = records.locator("tbody tr").nth(1).get_by_role("button")
    row.click()
    expect(row).to_have_attribute("aria-pressed", "true")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    expect(drawing).not_to_have_attribute("src", original)
    expect(drawing).not_to_have_attribute("alt", original_label)
    expect(thickness).to_have_value("2.2")
    href = page.locator(".library-screen-downloads a").first.get_attribute("href")
    selected = page.request.get(base + href)
    assert selected.ok and hashlib.sha256(selected.body()).hexdigest() == native["sha256"]
    page.get_by_role(
        "checkbox", name="只看选中分子" if zh else "Show selected molecules only"
    ).uncheck()
    assert records.bounding_box()["height"] <= 440
    navigation = page.locator(".library-screen-candidates .candidate-review-bar")
    previous = navigation.get_by_role(
        "button", name="上一个候选" if zh else "Previous candidate"
    )
    previous.press("Enter")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    page.screenshot(path=evidence / "library-inspection.png")


def verify_admet(page, base, zh, evidence):
    page.goto(f"{base}/#task={ADMET}")
    selected = page.locator(".admet-selected-molecule")
    drawing = selected.locator(".molecule-image[data-drawing-state=ready] img")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    tabs = page.locator(".admet-candidates .research-tab-list")
    require_no_horizontal_truncation(tabs)
    prepare = selected.get_by_role("button", name="用于分子准备" if zh else "Prepare this molecule")
    expect(prepare).to_be_enabled()
    draw_node = drawing.element_handle()
    prepare.click()
    form = page.locator(".state-preparation-handoff")
    heading = form.get_by_role("heading", name="分子准备" if zh else "Molecule preparation")
    expect(heading).to_be_visible()
    assert form.evaluate("(node) => node.contains(document.activeElement)")
    expect(drawing).to_be_hidden()
    form.get_by_role("button", name="返回性质预测" if zh else "Back to predictions").click()
    expect(prepare).to_be_focused()
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    assert drawing.evaluate("(node, before) => node === before", draw_node)
    page.screenshot(path=evidence / "admet-returns.png")


def verify_descriptors(page, base, zh, evidence):
    native = page.request.get(f"{base}/api/jobs/{PROPERTIES}/result").json()["molecules"]
    active = next(row for row in native if row["available"])
    page.goto(f"{base}/#task={PROPERTIES}")
    panel = page.locator(".properties-results")
    table = panel.locator(".property-descriptors table")
    expect(table).to_be_visible()
    expect(table.locator("tbody tr")).to_have_count(8)
    assert float(table.locator("tbody td").first.get_attribute("title")) == active["mw"]
    expect(panel.locator(".research-table")).to_have_count(0)
    inspector = panel.locator(".result-inspector")
    drawing = inspector.locator(".molecule-image[data-drawing-state=ready] img")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    assert drawing.bounding_box()["x"] < table.bounding_box()["x"]
    page.screenshot(path=evidence / "molecular-descriptors.png")
    frame = page.locator("iframe.drawing-service-frame")
    frame.evaluate("""frame => {
      const editor = frame.contentWindow;
      const service = editor.ketcher.structService;
      const native = service.dearomatize.bind(service);
      editor.reviewInputs = [];
      service.dearomatize = (options, ...rest) => {
        editor.reviewInputs.push(options.struct);
        return native(options, ...rest);
      };
    }""")
    panel.get_by_role("tab", name="记录与导出" if zh else "Records & export").click()
    records = panel.locator(".research-table .molecule-record")
    expect(records).to_have_count(2)
    for index, record in enumerate(native):
        molecule = property_record_bytes(page, base, record["input"])
        records.nth(index).click()
        expect(records.nth(index)).to_have_attribute("aria-pressed", "true")
        expect(inspector.get_by_role(
            "tab", name="三维结构" if zh else "3D structure", exact=True
        )).to_be_visible()
        inspector.get_by_role(
            "combobox", name="二维图线条粗细" if zh else "2D drawing line weight"
        ).select_option("2.2")
        page.wait_for_function(
            """structure => document.querySelector('iframe.drawing-service-frame')
                ?.contentWindow.reviewInputs.includes(structure)""",
            arg=molecule,
            timeout=DRAWING_TIMEOUT_MS,
        )
        expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    export = panel.get_by_role(
        "button", name="导出筛选结果" if zh else "Export filtered rows"
    )
    with page.expect_download() as download:
        export.click()
    with Path(download.value.path()).open(encoding="utf-8-sig", newline="") as content:
        exported = list(csv.DictReader(content))
    assert len(exported) == len(native)
    for row, original in zip(exported, native, strict=True):
        assert len(row) == 9
        assert float(row["MW (g/mol)"]) == original["mw"]
        assert float(row["TPSA (Å²)"]) == original["tpsa"]
        assert int(row["HBD"]) == original["hbd"]


def property_record_bytes(page, base, input_id):
    asset, one_based = input_id.split(":")
    url = f"{base}/api/assets/{asset}"
    metadata = page.request.get(f"{url}/metadata").json()
    original = page.request.get(url)
    assert original.ok and original.headers["x-structure-format"] == "sdf"
    body = original.body()
    assert hashlib.sha256(body).hexdigest() == metadata["sha256"]
    records = re.split(r"(?m)^[ \t]*\$\$\$\$[ \t]*\r?\n", body.decode("utf-8-sig"))
    return records[int(one_based) - 1]


def test_reviewed_property_poses_open_without_new_calculation(tmp_path, monkeypatch):
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, STAT6_SHA256)
    configuration = Path(os.environ["WB_UTILITY_GRAPHICS"]).read_bytes()
    (settings.state_dir / "deployment.json").write_bytes(configuration)
    evidence = Path("outputs/result-handoffs-desktop/reviewed-3d")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(settings.state_dir, evidence / "server.log") as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1400, "height": 880})
        page.add_init_script("localStorage.setItem('opendde-workbench.language', 'en')")
        blocked, qualified = [], []

        def retained_only(route):
            req = route.request
            if req.method in {"GET", "HEAD"}:
                route.continue_()
            elif req.method == "POST" and urlsplit(req.url).path == "/api/research/poses/initial":
                body = {**req.post_data_json, "allow_compute": False}
                response = route.fetch(post_data=body)
                qualified.append((body["source"], response.json()))
                route.fulfill(response=response)
            else:
                blocked.append((req.method, req.url))
                route.abort()

        page.route("**/api/**", retained_only)
        before = page.request.get(f"{base}/api/jobs").json()
        for job in RETAINED_3D_PROPERTIES:
            native = page.request.get(f"{base}/api/jobs/{job}/result").json()["molecules"][0]
            asset, one_based = native["input"].split(":")
            expected = page.request.get(f"{base}/api/assets/{asset}/metadata").json()["sha256"]
            assert "3D" in property_record_bytes(page, base, native["input"]).splitlines()[1]
            page.goto(f"{base}/#task={job}")
            inspector = page.locator(".properties-results .result-inspector")
            inspector.get_by_role("tab", name="3D structure", exact=True).click()
            expect(inspector.get_by_role("button", name="Capture 3D view")).to_be_enabled(
                timeout=DRAWING_TIMEOUT_MS
            )
            source, response = qualified[-1]
            assert source == {"kind": "asset", "asset_id": asset, "record": int(one_based) - 1}
            assert response["state"] == "ready"
            reference = response["pose"]["reference"]
            assert reference["asset_id"] == asset and reference["sha256"] == expected
            assert reference["record"] == int(one_based) - 1
            expect(page.locator(".property-descriptors table")).to_be_visible()
            page.screenshot(path=evidence / f"{job}-native-3d.png")
        assert len(qualified) == len(RETAINED_3D_PROPERTIES)
        assert not blocked and page.request.get(f"{base}/api/jobs").json() == before
        browser.close()
