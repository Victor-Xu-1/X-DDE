"""Render retained chemistry views in short and normal desktop windows."""

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.molecular_review_capture import launch_review_browser
from server_tests.publication_browser_helpers import export_figure, inspect_png

CASES = {
    "library": ("7ae24752-06e5-4030-928c-a4a414b96596", ".library-screen-results"),
    "properties": ("d5aba1ec-246a-4226-96b8-92648597c38b", ".properties-results"),
    "admet": ("4176a201-7b25-456f-ad5b-b3eecf4e0334", ".admet-results"),
}
RAILS = {
    "library": ".library-screen-records",
    "properties": ".property-descriptors",
    "admet": ".admet-endpoint-scroll",
}


def first_view(page, locator, minimum):
    page.evaluate("window.scrollTo({top: 0, left: 0, behavior: 'instant'})")
    bounds = locator.bounding_box()
    assert bounds and bounds["height"] >= minimum and bounds["y"] >= 0, bounds
    assert bounds["y"] + bounds["height"] <= page.viewport_size["height"] + 2, bounds
    return bounds


def verify_drawing(page, root, name, evidence):
    drawing = root.locator(".molecule-image[data-drawing-state=ready] img")
    expect(drawing).to_be_visible(timeout=45000)
    stage = first_view(page, root.locator(".figure-preview-sheet"), 220)
    rail = root.locator(RAILS[name])
    details = first_view(page, rail, 160)
    assert stage["x"] + stage["width"] < details["x"]
    assert rail.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    expect(root.locator(".figure-export-trigger")).to_be_in_viewport()
    page.screenshot(path=evidence / f"{name}-2d.png")
    return stage


def verify_structure(page, root, name, zh, evidence):
    label = "三维结构" if zh else "3D structure"
    root.get_by_role("tab", name=label, exact=True).click()
    capture = "生成三维视图图片" if zh else "Capture 3D view"
    expect(root.get_by_role("button", name=capture, exact=True)).to_be_enabled(
        timeout=45000
    )
    scene = root.locator(".molecular-stage iframe")
    bounds = first_view(page, scene, 260 if name == "admet" else 300)
    assert bounds["width"] >= 480
    assert bounds["x"] + bounds["width"] < root.locator(RAILS[name]).bounding_box()["x"]
    page.screenshot(path=evidence / f"{name}-3d.png")
    return scene


def verify_handoff(page, root, scene, zh):
    preview_before = scene.element_handle()
    prepare = root.get_by_role("button", name="用于分子准备" if zh else "Prepare this molecule")
    expect(prepare).to_be_in_viewport()
    prepare.click()
    form = page.locator(".state-preparation-handoff")
    expect(form.get_by_role(
        "heading", name="分子准备" if zh else "Molecule preparation"
    )).to_be_visible()
    expect(form.get_by_role(
        "heading", name="1. 选择分子" if zh else "1. Choose molecule"
    )).to_be_focused()
    form.get_by_role(
        "button", name="返回性质预测" if zh else "Back to predictions"
    ).click()
    expect(prepare).to_be_focused()
    expect(scene).to_be_visible()
    assert scene.evaluate("(node, prior) => node === prior", preview_before)


@pytest.mark.parametrize("lang,width,height,theme", [
    ("en", 1180, 720, "warm"),
    ("zh", 1440, 900, "dark"),
])
def test_retained_short_chemistry_results(tmp_path, monkeypatch, lang, width, height, theme):
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, SHA256)
    (settings.state_dir / "deployment.json").write_bytes(
        Path(os.environ["WB_UTILITY_GRAPHICS"]).read_bytes()
    )
    evidence = Path("outputs/result-handoffs-desktop") / f"short-{lang}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "server.log") as base,
        sync_playwright() as driver,
    ):
        browser = launch_review_browser(driver)
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{lang}');"
            f"localStorage.setItem('x-dde-theme', '{theme}');"
        )
        blocked, retained, sizes = [], [], {}

        def replay(route):
            req = route.request
            if req.method in {"GET", "HEAD", "OPTIONS"}:
                route.continue_()
            elif req.method == "POST" and urlsplit(req.url).path == "/api/research/poses/initial":
                response = route.fetch(post_data={
                    **req.post_data_json, "allow_compute": False, "retry": False,
                })
                retained.append(response.json())
                route.fulfill(response=response)
            else:
                blocked.append((req.method, req.url))
                route.abort()

        page.route("**/api/**", replay)
        before = page.request.get(f"{base}/api/jobs").json()
        for name, (job, selector) in CASES.items():
            page.goto(f"{base}/#task={job}")
            workspace = page.locator(selector)
            sizes[name] = verify_drawing(page, workspace, name, evidence)
            if name == "library":
                continue
            scene = verify_structure(page, workspace, name, lang == "zh", evidence)
            if name == "admet":
                verify_handoff(page, workspace, scene, lang == "zh")
                if lang == "en":
                    figure = export_figure(
                        page, workspace.locator(".viewer-panel .figure-export-trigger"),
                        evidence, "retained-admet-structure", lang,
                    )
                    inspect_png(figure)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert not blocked and retained
        assert all(
            item["state"] == "ready"
            or (item["state"] == "task" and item["job"]["status"] == "succeeded")
            for item in retained
        )
        assert page.request.get(f"{base}/api/jobs").json() == before
        (evidence / "desktop.json").write_text(json.dumps(sizes, indent=2))
        browser.close()
