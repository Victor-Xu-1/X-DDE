"""Render retained chemistry views in short and normal desktop windows."""

import hashlib
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
UTILITY_EXAMPLES = (
    ("ADMET prediction", "ADMET 预测", "admet.predict", ".admet-results"),
    ("Molecular properties", "分子性质", "properties", ".properties-results"),
    (
        "Similarity & structural alerts", "相似性与结构筛查",
        "chemistry.screen", ".library-screen-results",
    ),
    (
        "Protonation & tautomers", "质子化与互变异构",
        "chemistry.states", ".molecular-state-results",
    ),
)


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


def verify_canvas_and_rail(page, root, selector, minimum):
    bounds = first_view(page, root.locator(selector), minimum)
    rail = root.locator(".structure-workbench-details")
    assert bounds["width"] >= 360
    assert bounds["x"] + bounds["width"] < rail.bounding_box()["x"]
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    return bounds


def verify_original_conformer(page, root, native, zh):
    ready = root.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(ready).to_be_enabled(timeout=45000)
    bounds = verify_canvas_and_rail(page, root, ".molecular-stage iframe", 240)
    conformers = root.get_by_role("combobox", name="游离构象" if zh else "Free conformer")
    chosen = conformers.select_option(index=1)[0]
    record = next(row for row in native["conformers"] if str(row["record"]) == chosen)
    expect(ready).to_be_enabled(timeout=45000)
    original = root.get_by_role(
        "button", name="下载所选原始构象 SDF" if zh else "Download selected original conformer SDF",
    )
    with page.expect_download() as saved:
        original.click()
    assert saved.value.suggested_filename == record["artifact"]
    assert hashlib.sha256(saved.value.path().read_bytes()).hexdigest() == record["artifact_sha256"]
    root.get_by_role("tab", name="二维结构" if zh else "2D structure", exact=True).click()
    expect(root.locator(".molecule-image[data-drawing-state=ready] img")).to_be_visible(
        timeout=45000,
    )
    drawing = verify_canvas_and_rail(page, root, ".figure-preview-sheet", 240)
    assert abs(drawing["x"] - bounds["x"]) <= 12
    return bounds


@pytest.mark.parametrize("lang,width,height,theme", [
    ("en", 1001, 600, "warm"),
    ("zh", 1079, 680, "dark"),
])
def test_saved_utility_examples_fit_narrow_desktop(
    tmp_path, monkeypatch, lang, width, height, theme,
):
    zh = lang == "zh"
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, SHA256)
    (settings.state_dir / "deployment.json").write_bytes(
        Path(os.environ["WB_UTILITY_GRAPHICS"]).read_bytes()
    )
    evidence = Path("outputs/result-handoffs-desktop") / f"utility-{lang}-{width}"
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
        blocked = []

        def read_only(route):
            if route.request.method in {"GET", "HEAD", "OPTIONS"}:
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()

        page.route("**/api/**", read_only)
        before = page.request.get(f"{base}/api/jobs").json()
        page.goto(f"{base}/#view=utilities")
        for en, cn, capability, selector in UTILITY_EXAMPLES:
            tabs = page.locator(".utility-tabs")
            tabs.get_by_role("button", name=cn if zh else en, exact=True).click()
            panel = page.locator(".utility-panel:not([hidden])")
            start = panel.get_by_role("button", name="示例结果" if zh else "Example results")
            start.click()
            preview = panel.locator(".module-example-result")
            root = preview.locator(selector)
            if capability == "chemistry.states":
                pin = page.request.get(f"{base}/api/examples/{capability}?profile=stat6").json()
                native = page.request.get(f"{base}/api/jobs/{pin['pin']['job_id']}/result").json()
                verify_original_conformer(page, root, native, zh)
            else:
                expect(root.locator(".molecule-image[data-drawing-state=ready] img")).to_be_visible(
                    timeout=45000,
                )
                verify_canvas_and_rail(page, root, ".figure-preview-sheet", 216)
            page.screenshot(path=evidence / f"{capability}.png")
            panel.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form",
            ).click()
            expect(start).to_be_focused()
            expect(panel.locator(".utility-source-pane")).to_be_visible()
        assert not blocked
        assert page.request.get(f"{base}/api/jobs").json() == before
        browser.close()
