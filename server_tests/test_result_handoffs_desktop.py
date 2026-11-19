"""Replay retained ADMET and library results through the desktop inspection UI."""

import hashlib
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform

ADMET = "9699cfec-c574-40da-8ede-cec190d199c5"
LIBRARY = "b4db0db0-c238-42b3-8ee9-6ca0e4cb1f40"
PROPERTIES = "5c35e148-cb26-4e46-b5ab-2231e228ccea"
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
    drawing = panel.locator(".molecule-image[data-drawing-state=ready] img")
    expect(drawing).to_be_visible(timeout=DRAWING_TIMEOUT_MS)
    assert drawing.bounding_box()["x"] < table.bounding_box()["x"]
    page.screenshot(path=evidence / "molecular-descriptors.png")
    panel.get_by_role("tab", name="记录与导出" if zh else "Records & export").click()
    expect(panel.get_by_role(
        "button", name="导出筛选结果" if zh else "Export filtered rows"
    )).to_be_enabled()
