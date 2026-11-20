"""Verify the shared palette on retained molecular results in desktop Chrome."""

import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_candidate_inspection_desktop import load_case

CASES = ("drugclip.index", "screening.dock", "library.select", "del.candidates")


def palette(page):
    return page.locator("body").evaluate("""root => {
        const tokens = ['ink', 'muted', 'surface', 'surface-muted', 'accent', 'accent-soft'];
        const probe = document.createElement('span');
        probe.hidden = true;
        root.append(probe);
        const colors = Object.fromEntries(tokens.map(name => {
          probe.style.color = 'var(--' + name + ')';
          return [name, getComputedStyle(probe).color];
        }));
        probe.remove();
        return colors;
    }""")


def check_downloads(result, colors):
    menu = result.locator(".dataset-download-menu")
    trigger = menu.locator(":scope > summary")
    expect(trigger).to_have_css("color", colors["accent"])
    expect(trigger).to_have_css("background-color", colors["surface"])
    trigger.press("Enter")
    expect(menu).to_have_attribute("open", "")
    expect(trigger).to_have_css("background-color", colors["accent-soft"])
    expect(menu.locator(":scope > div")).to_have_css("background-color", colors["surface"])
    link = menu.locator("a:visible").first
    expect(link).to_be_visible()
    expect(link).to_have_css("color", colors["accent"])
    expect(link).to_have_attribute("href", re.compile(r"^/api/jobs/[^/]+/download\?name="))
    trigger.press("Enter")
    expect(menu).not_to_have_attribute("open", "")


def check_chains(result, colors):
    menu = result.locator(".viewer-chain-menu")
    trigger = menu.locator(":scope > summary")
    expect(trigger).to_have_css("color", colors["ink"])
    trigger.press("Enter")
    expect(menu).to_have_attribute("open", "")
    expect(trigger).to_have_css("background-color", colors["accent-soft"])
    expect(menu.locator("label").first).to_have_css("color", colors["ink"])
    chains = menu.get_by_role("checkbox")
    total = chains.count()
    chain = chains.first
    expect(chain).to_be_checked()
    chain.click()
    expect(trigger).to_contain_text(f"{total - 1} / {total}")
    expect(chain).not_to_be_checked()
    chain.click()
    expect(trigger).to_contain_text(f"{total} / {total}")
    expect(chain).to_be_checked()
    trigger.press("Enter")
    expect(menu).not_to_have_attribute("open", "")


def check_index_member(result, colors, zh):
    expect(result.locator(".dataset-member-heading h3")).to_have_css("color", colors["ink"])
    expect(result.locator(".dataset-member-heading > span")).to_have_css("color", colors["muted"])
    geometry = result.get_by_text("游离构象" if zh else "Unbound conformer", exact=True)
    expect(geometry).to_have_css("color", colors["muted"])
    header = result.locator(".dataset-table-scroll th").first
    expect(header).to_have_css("color", colors["muted"])
    expect(header).to_have_css("background-color", colors["surface-muted"])
    footer = result.locator(".dataset-table-footer").first
    expect(footer.locator("span")).to_have_css("color", colors["muted"])
    previous = footer.get_by_role("button", name="上一页" if zh else "Previous")
    following = footer.get_by_role("button", name="下一页" if zh else "Next")
    expect(previous).to_be_disabled()
    expect(following).to_have_css("color", colors["ink"])
    following.click()
    expect(footer.locator("span")).to_have_text(re.compile(r"^21–"))
    previous.click()
    expect(footer.locator("span")).to_have_text("1–20")


def check_del_definition(page, base, settings, colors):
    load_case(page, base, "del.library", settings)
    result = page.locator(".del-definition-view")
    barcode = result.locator(".del-barcode-map > div").first
    expect(barcode).to_have_css("background-color", colors["surface-muted"])
    expect(barcode.locator("strong")).to_have_css("color", colors["ink"])
    expect(barcode.locator("code")).to_have_css("color", colors["muted"])
    block = result.locator(".dataset-block-grid article").first
    expect(block).to_have_css("background-color", colors["surface"])
    expect(block.locator("strong")).to_have_css("color", colors["ink"])
    expect(block.locator("code")).to_have_css("color", colors["muted"])
    drawing = block.locator(".molecule-image")
    expect(drawing).to_have_css("background-color", "rgb(255, 255, 255)")
    drawing.scroll_into_view_if_needed()
    expect(drawing.locator("img")).to_be_visible(timeout=30000)


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1120, 650),
    ("zh", "dark", 1280, 700),
    ("en", "light", 1440, 900),
])
def test_native_result_controls_follow_theme(language, theme, width, height):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    zh = language == "zh"
    evidence = Path("outputs/candidate-inspection") / f"theme-{theme}"
    evidence.mkdir(parents=True, exist_ok=True)
    writes = []

    def readonly(route):
        if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
            writes.append(route.request.url)
            route.abort()
        else:
            route.continue_()

    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""
            localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        page.route("**/api/**", readonly)
        runtime = f"{base}/api/runtime-controls?include_native=false"
        before = page.request.get(runtime).json()
        for capability in CASES:
            load_case(page, base, capability, settings)
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            result = page.locator(".dataset-results")
            capture = result.get_by_role("button", name=(
                "生成三维视图图片" if zh else "Capture 3D view"
            ))
            expect(capture).to_be_enabled(timeout=35000)
            expect(result.locator(".molecular-stage iframe")).to_be_visible()
            colors = palette(page)
            active_mode = result.locator('.viewer-mode-options > button[aria-pressed="true"]')
            expect(active_mode).to_have_css("color", colors["accent"])
            expect(active_mode).to_have_css("background-color", colors["accent-soft"])
            check_downloads(result, colors)
            if capability != "screening.dock":
                check_chains(result, colors)
            if capability == "drugclip.index":
                check_index_member(result, colors, zh)
            else:
                expect(result.locator(".dataset-panel-title strong").first).to_have_css(
                    "color", colors["ink"]
                )
            page.evaluate("window.scrollTo(0, 0)")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=evidence / f"{capability}.png")
        check_del_definition(page, base, settings, colors)
        page.screenshot(path=evidence / "del-library.png")
        assert writes == []
        assert page.request.get(runtime).json() == before
        assert all(not engine["enabled"] and not engine["active"] for engine in before["engines"])
        browser.close()
