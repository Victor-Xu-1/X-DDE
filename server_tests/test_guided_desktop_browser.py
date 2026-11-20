"""Focused desktop input acceptance with a public structure and no compute jobs."""

import re
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6 import catalogue
from server_tests.browser_platform import platform

CASES = (
    "boltz.predict",
    "gnina.dock",
    "caver.paths",
    "p2rank.detect",
    "openmm.dynamics",
    "openfe.rbfe",
    "apbs.potential",
    "deepternary.model",
)
UPLOAD_CHUNK = re.compile(r"/api/assets/uploads/[0-9a-f-]{36}")


def open_task(page, base, tool):
    page.goto(f"{base}/?test={tool}#view=new&tool={tool}")
    expect(page.locator(f'[data-capability="{tool}"]').first).to_be_visible()
    workspace = page.locator(".tool-center.is-input")
    expect(workspace.locator(".example-loading")).to_have_count(0)
    return workspace.locator(".questionnaire:visible")


def geometry(form, height):
    active = form.locator("> fieldset[aria-labelledby]:not([hidden])")
    expect(active).to_have_count(1)
    expect(active).to_have_css("overflow-y", "auto")
    view = active.bounding_box()
    footer = form.locator(".questionnaire-actions").bounding_box()
    assert view and footer and view["height"] >= 210
    assert view["y"] + view["height"] <= footer["y"] + 1
    assert footer["y"] + footer["height"] <= height + 1
    assert form.page.evaluate(
        "scrollY === 0 && document.documentElement.scrollWidth <= innerWidth + 1"
    )
    return active, view, footer


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1120, 650),
    ("zh", "dark", 1280, 700),
    ("en", "light", 1440, 900),
])
def test_desktop_guide_keeps_navigation_and_native_structure_in_view(
    tmp_path, language, theme, width, height,
):
    evidence = Path("outputs/guided-desktop") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    state.mkdir()
    zh = language == "zh"
    with (
        platform(state, evidence / "platform.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": width, "height": height}, reduced_motion="reduce",
        )
        page.add_init_script(f"""
            localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        unexpected_writes = []

        def guard(route):
            request = route.request
            path = urlsplit(request.url).path
            upload = request.url.startswith(base + "/") and (
                (request.method == "POST" and (
                    path in {"/api/assets", "/api/assets/uploads"}
                    or (
                        path.endswith("/complete") and
                        UPLOAD_CHUNK.fullmatch(path.removesuffix("/complete"))
                    )
                ))
                or (request.method == "PUT" and UPLOAD_CHUNK.fullmatch(path))
            )
            if request.method in {"GET", "HEAD", "OPTIONS"} or upload:
                route.continue_()
            else:
                unexpected_writes.append(request.url)
                route.abort()

        page.route("**/api/**", guard)
        next_name = "下一步" if zh else "Next"
        back_name = "上一步" if zh else "Back"
        for tool in CASES:
            form = open_task(page, base, tool)
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            step, _, _ = geometry(form, height)
            action = form.get_by_role("button", name=next_name, exact=True)
            expect(action).to_be_in_viewport(ratio=1)
            expect(action).to_be_disabled()
            if tool == "deepternary.model":
                step.evaluate("element => { element.scrollTop = element.scrollHeight; }")
                assert step.evaluate("element => element.scrollTop") > 0
                geometry(form, height)
            if width <= 1280 and tool == "gnina.dock":
                materials = step.locator(".diff-reference > .reference-material")
                expect(materials).to_have_count(2)
                first, second = (node.bounding_box() for node in materials.all())
                assert first and second and abs(first["y"] - second["y"]) <= 1
                assert first["x"] + first["width"] < second["x"]
            if tool in {"gnina.dock", "deepternary.model"}:
                step.evaluate("element => { element.scrollTop = 0; }")
                page.screenshot(path=evidence / f"{tool}.png")

        tool = "biopython.exposure" if zh else "caver.paths"
        form = open_task(page, base, tool)
        step, _, _ = geometry(form, height)
        source = catalogue.ROOT / "inputs/9BIG.cif"
        step.locator('input[type="file"]').set_input_files(source)
        action = form.get_by_role("button", name=next_name, exact=True)
        expect(step.locator(".selected-file:visible")).to_contain_text(source.name, timeout=20000)
        expect(action).to_be_enabled(timeout=20000)
        action.click()
        step, bounds, footer = geometry(form, height)
        select = step.locator(".surface-region-choices select")
        expect(select.locator("option").nth(100)).to_be_attached(timeout=30000)
        canvas = step.locator(".molecular-stage iframe")
        expect(canvas).to_be_visible(timeout=30000)
        viewer = canvas.bounding_box()
        choices = step.locator(".structure-workbench-details").bounding_box()
        assert viewer and choices and viewer["width"] > choices["width"]
        assert viewer["x"] + viewer["width"] < choices["x"]
        visible = min(bounds["y"] + bounds["height"], viewer["y"] + viewer["height"])
        assert visible - viewer["y"] >= 220
        assert footer["y"] >= visible
        page.screenshot(path=evidence / f"{tool}-region.png")
        display = step.locator(".viewer-tool-group.is-display > button")
        expect(display).to_be_in_viewport(ratio=1)
        display.click()
        expect(display).to_have_attribute("aria-expanded", "true")
        expect(step.locator(".viewer-tool-group.is-display .viewer-tool-content")).to_be_visible()
        display.press("Escape")
        expect(display).to_be_focused()
        expect(display).to_have_attribute("aria-expanded", "false")
        expand = step.locator("[data-workspace-expand]").first
        expand.click()
        workbench = step.locator(".structure-workbench")
        expect(workbench).to_have_attribute("data-workspace-expanded", "true")
        page.keyboard.press("Escape")
        expect(workbench).not_to_have_attribute("data-workspace-expanded", "true")
        expect(expand).to_be_focused()
        geometry(form, height)
        select.select_option(index=1)
        values = step.locator(".surface-selected")
        picked = values.get_by_role("button")
        expect(picked).to_be_visible()
        label = picked.inner_text()
        expect(action).to_be_enabled()
        action.click()
        geometry(form, height)
        back = form.get_by_role("button", name=back_name, exact=True)
        expect(back).to_be_in_viewport(ratio=1)
        back.click()
        expect(values.get_by_role("button")).to_have_text(label)
        back.click()
        expect(form.locator(".selected-file:visible")).to_contain_text(source.name)
        geometry(form, height)
        assert not unexpected_writes
        assert page.request.get(base + "/api/jobs").json() == []
        browser.close()
