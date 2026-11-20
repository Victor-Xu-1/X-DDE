"""Check shared desktop result navigation against the retained study workspaces."""

import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_candidate_inspection_desktop import load_case

CASES = ("drugclip.index", "screening.dock", "del.candidates", "plip.profile")


def verify_header(header, compact, zh):
    back_label = "返回任务结果" if zh else "Back to task results"
    refresh_label = "刷新任务" if zh else "Refresh tasks"
    back = header.get_by_role("button", name=back_label, exact=True)
    refresh = header.get_by_role("button", name=refresh_label, exact=True)
    expect(back).to_have_attribute("title", back_label)
    expect(refresh).to_have_attribute("title", refresh_label)
    expect(back).to_be_in_viewport(ratio=1)
    expect(refresh).to_be_in_viewport(ratio=1)
    caption = back.locator(".task-result-back-label")
    if compact:
        expect(caption).to_be_hidden()
        button = back.bounding_box()
        assert button and 34 <= button["width"] <= 44
    else:
        expect(caption).to_be_visible()
    title = header.locator("h2")
    expect(title).to_be_visible()
    expect(header.locator(".panel-heading .status")).to_be_visible()
    expect(header.get_by_role("switch").first).to_be_visible()
    assert title.evaluate(
        "node => node.scrollWidth <= node.clientWidth + 1 "
        "&& getComputedStyle(node).textOverflow !== 'ellipsis'"
    )
    return back, refresh, title


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1080, 650),
    ("zh", "dark", 1120, 650),
    ("en", "light", 1440, 900),
])
def test_retained_result_headers_at_desktop_sizes(language, theme, width, height):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = Path("outputs/candidate-inspection") / f"result-header-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    writes = []

    def readonly(route):
        if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
            writes.append(route.request.url)
            route.abort()
        else:
            route.continue_()

    with (
        platform(settings.state_dir, evidence / "app.log") as base,
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
            header = page.locator(".detail-panel.has-header-navigation > .task-detail-header")
            back, refresh, title = verify_header(header, width < 1200, zh)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if capability == "drugclip.index":
                preview = page.locator(".dataset-member-inspector .molecular-stage iframe")
                capture = page.get_by_role(
                    "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
                )
                expect(capture).to_be_enabled(timeout=35_000)
                expect(preview).to_be_in_viewport(ratio=0.98)
                box = header.bounding_box()
                assert box and box["height"] < 96
                task_title = title.inner_text()
                refresh.press("Enter")
                expect(title).to_have_text(task_title)
                page.screenshot(path=evidence / f"{capability}.png")
                back.press("Enter")
                history = page.get_by_role("heading", name="任务结果" if zh else "Task results")
                expect(history).to_be_focused()
                expect(header).to_have_count(0)
            else:
                page.screenshot(path=evidence / f"{capability}.png")
        assert writes == []
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()
