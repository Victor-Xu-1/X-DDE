"""Resize archived MD and FEP scenes through their real desktop workspaces."""

import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

STAGE = ".simulation-webgl"
READY = STAGE + '[data-loaded="true"][aria-busy="false"]'


def measure_focused(page, workspace, count):
    selector = ".structure-workbench[data-workspace-focus='true']"
    page.wait_for_function(
        """({selector, ready, count}) => {
            const target = document.querySelector(selector);
            const pane = target?.querySelector(':scope > .structure-workbench-view');
            if (!pane) return false;
            const scenes = Array.from(pane.querySelectorAll(ready));
            const bottom = pane.getBoundingClientRect().bottom;
            return scenes.length === count && scenes.every(
                scene => Math.abs(bottom - scene.getBoundingClientRect().bottom) <= 2);
        }""",
        arg={"selector": selector, "ready": READY, "count": count},
    )
    return [item.bounding_box() for item in workspace.locator(READY).all()]


def verify_frame(page, base, root, result, zh):
    slider = root.get_by_role("slider", name="轨迹时间" if zh else "Trajectory time")
    assert slider.bounding_box()["y"] < root.locator(READY).bounding_box()["y"]
    expect(slider).to_be_in_viewport(ratio=1)
    slider.press("End")
    frames = result["dynamics"]["replicas"][0]["frames"]
    expect(root.get_by_test_id("molstar-viewport")).to_have_attribute(
        "data-frame", str(len(frames) - 1), timeout=30000,
    )
    expect(root.locator(READY)).to_have_count(1)
    artifact = frames[-1]["artifact"]
    source = root.get_by_role("link", name="下载当前结构" if zh else "Download frame")
    expect(source).to_be_in_viewport(ratio=1)
    response = page.request.get(base + source.get_attribute("href"))
    assert response.ok
    assert hashlib.sha256(response.body()).hexdigest() == result["artifact_sha256"][artifact]


@pytest.mark.parametrize(
    ("case", "language", "width", "height"),
    [("openmm.dynamics", "en", 1280, 720), ("openfe.rbfe", "zh", 1600, 900)],
)
def test_native_simulation_structure_focus(case, language, width, height):
    source = Path("outputs/native-simulations") / case
    identifier = (source / "job-id.txt").read_text().strip()
    evidence = source / "browser" / "structure-focus"
    evidence.mkdir(parents=True, exist_ok=True)
    dynamics = case == "openmm.dynamics"
    zh = language == "zh"
    with platform(source / "state", evidence / "app.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, writes = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: writes.append(request.url)
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
            else None,
        )
        result_url = base + "/api/jobs/" + identifier + "/result"
        result = page.request.get(result_url).json()
        page.goto(base + "/#task=" + identifier)
        root = page.get_by_test_id("dynamics-results" if dynamics else "free-energy-results")
        workspace = root.locator(".structure-workbench")
        details = workspace.locator(":scope > .structure-workbench-details")
        control = root.locator("[data-workspace-expand]")
        focus = root.get_by_role("button", name="专注结构" if zh else "Focus structure")
        restore = root.get_by_role("button", name="显示分析面板" if zh else "Show analysis panel")
        pair = root.get_by_role("button", name="A / B 并列" if zh else "A / B side by side")
        overlay = root.get_by_role("button", name="叠加查看" if zh else "Overlay", exact=True)
        count = 1 if dynamics else 2
        if not dynamics:
            pair.click()
        expect(root.locator(READY)).to_have_count(count, timeout=45000)
        originals = root.locator(READY + " canvas").element_handles()
        expect(control).to_have_count(1)
        control.click()
        narrow = root.locator(READY).first.bounding_box()
        assert narrow
        focus.click()
        expect(restore).to_be_focused()
        expect(details).to_be_hidden()
        wide = measure_focused(page, workspace, count)
        assert all(rect and rect["width"] > narrow["width"] * 1.25 for rect in wide)
        assert all(
            current.evaluate("(node,original) => node === original", original)
            for current, original in zip(
                root.locator(READY + " canvas").all(), originals, strict=True,
            )
        )
        if dynamics:
            verify_frame(page, base, root, result, zh)
            export = root.get_by_role("button", name="下载视图" if zh else "Download view")
        else:
            assert abs(wide[0]["y"] - wide[1]["y"]) < 2
            assert abs(wide[0]["height"] - wide[1]["height"]) < 2
            overlay.click()
            expect(overlay).to_have_attribute("aria-pressed", "true")
            measure_focused(page, workspace, 1)
            pair.click()
            measure_focused(page, workspace, 2)
            expect(control).to_have_count(1)
            match = root.get_by_role("button", name="匹配视角" if zh else "Match views")
            match.click()
            export = root.get_by_role("button", name="导出比较图" if zh else "Export comparison")
        png = export_figure(page, export, evidence, "focused-structure", language)
        inspect_png(png)
        expect(workspace).to_have_attribute("data-workspace-focus", "true")
        page.screenshot(path=str(evidence / "focused-workspace.png"))
        restore.click()
        expect(details).to_be_visible()
        if dynamics:
            expect(root.get_by_test_id("molstar-viewport")).to_have_attribute(
                "data-frame", str(len(result["dynamics"]["replicas"][0]["frames"]) - 1),
            )
        else:
            expect(pair).to_have_attribute("aria-pressed", "true")
        page.keyboard.press("Escape")
        expect(workspace).not_to_have_attribute("data-workspace-expanded", "true")
        expect(control).to_be_focused()
        assert page.request.get(result_url).json() == result
        runtime = page.request.get(base + "/api/runtime-controls?include_native=false").json()
        assert all(not item["enabled"] and not item["active"] for item in runtime["engines"])
        assert not errors and not writes, {"errors": errors, "writes": writes}
        browser.close()
