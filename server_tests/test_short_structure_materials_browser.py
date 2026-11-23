"""Check retained structure materials in short desktop Chrome without inference."""

import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_prepared_structure_workspace_browser import check_summary
from server_tests.test_short_protein_viewports import canvas_in_workspace, ready

CASES = (
    ("discovery.import", ".reference-import-results", "artifact", ".reference-import-actions"),
    ("biopython.prepare", ".prepared-structure-workspace", "artifact", ".prepared-structure-actions"),
    ("diffsbdd.prepare", ".prepared-structure-workspace", "structure", ".prepared-structure-actions"),
)


def read(page, base, path):
    response = page.request.get(f"{base}/api/{path}")
    assert response.ok, path
    return response.json()


def verify_source(page, link, filename, checksum):
    expect(link).to_be_in_viewport()
    with page.expect_download() as saved:
        link.press("Enter")
    download = saved.value
    assert download.suggested_filename == filename
    assert hashlib.sha256(Path(download.path()).read_bytes()).hexdigest() == checksum


def verify_modes(page, result, scene, label):
    frame = scene.element_handle()
    for name in (label("Surface", "分子表面"), label("Backbone", "整体骨架")):
        mode = result.get_by_role("button", name=name, exact=True)
        mode.press("Enter")
        expect(mode).to_have_attribute("aria-pressed", "true")
    expand = result.locator("[data-workspace-expand]")
    expand.press("Enter")
    expect(result.locator(".structure-workbench")).to_have_attribute(
        "data-workspace-expanded", "true",
    )
    page.keyboard.press("Escape")
    expect(expand).to_be_focused()
    assert frame.evaluate("el => el.isConnected")


def verify_reference_recovery(page, result, source, label):
    response = page.request.get(source)
    assert response.ok
    corrupted = response.body() + b"\n# transport changed the archive bytes\n"
    page.route(source, lambda route: route.fulfill(status=200, body=corrupted))
    page.reload()
    error = result.locator(".viewer-error")
    action = result.get_by_role("button", name=label("Prepare research structure", "准备研究结构"))
    expect(error).to_be_visible(timeout=45000)
    expect(action).to_be_disabled()
    assert result.locator(".molecular-stage").bounding_box()["height"] == 220
    page.unroute(source)
    error.get_by_role("button", name=label("Reload", "重新加载")).click()
    expect(error).to_have_count(0)
    expect(action).to_be_enabled(timeout=45000)


def verify_reference_handoff(page, result, label, zh, evidence):
    action = result.get_by_role("button", name=label("Prepare research structure", "准备研究结构"))
    if not zh:
        trigger = result.locator(".figure-export-trigger")
        inspect_png(export_figure(page, trigger, evidence, "reference-figure", "en"))
    action.click()
    expect(page.locator(".task-result-content .questionnaire-steps")).to_be_visible()
    page.get_by_role(
        "button", name=label("Back to reference material", "返回参考材料"), exact=True,
    ).click()
    ready(result, zh)


def verify_case(page, base, case, label, zh, evidence):
    capability, selector, artifact_key, actions = case
    example = read(page, base, f"examples/{capability}?profile=stat6")
    assert example["study"]["id"] == "stat6"
    pin = example["pin"]
    native = read(page, base, f"jobs/{pin['job_id']}/result")
    name = native[artifact_key]
    reference = native.get("kind") == "structure"
    page.goto(f"{base}/#task={pin['job_id']}")
    result = page.locator(f".detail-panel {selector}")
    link = result.locator(f"{actions} a[download]")
    if reference:
        source = link.evaluate("el => el.href")
        verify_reference_recovery(page, result, source, label)
    view = ready(result, zh)
    height = page.viewport_size["height"]
    canvas_in_workspace(result, view, height, 300, 400)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.screenshot(path=evidence / f"{capability}-history.png")
    verify_modes(page, result, view, label)
    verify_source(page, link, name, pin["artifact_sha256"][name])
    if reference:
        verify_reference_handoff(page, result, label, zh, evidence)
    else:
        check_summary(page, result.locator(".structure-workbench-details"), native, label)

    page.goto(f"{base}/?inspection=materials#view=new&tool={capability}")
    page.get_by_role("button", name=label("Example results", "示例结果"), exact=True).click()
    template = page.locator(".module-template.is-preview")
    sample = template.locator(selector)
    canvas_in_workspace(sample, ready(sample, zh), height, 300, 400)
    page.screenshot(path=evidence / f"{capability}-example.png")
    template.get_by_role(
        "button", name=label("Return to task form", "返回任务填写"), exact=True,
    ).click()
    expect(template).to_have_count(0)


@pytest.mark.parametrize(
    ("language", "theme", "height"), [("en", "warm", 600), ("zh", "dark", 580)],
)
def test_short_structure_materials(language, theme, height):
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    evidence = Path("outputs/short-structure-materials") / f"{language}-1001-{height}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / "platform.log") as base,
        sync_playwright() as pw,
    ):
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1001, "height": height})
        page.add_init_script(f"""
            localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []
        page.route("**/api/**", lambda route: (
            route.continue_() if route.request.method in {"GET", "HEAD", "OPTIONS"}
            else (writes.append(route.request.url), route.abort())
        ))
        power_path = "runtime-controls?include_native=false"
        power = read(page, base, power_path)
        for case in CASES:
            verify_case(page, base, case, label, zh, evidence)
        assert not writes and read(page, base, power_path) == power
        browser.close()
