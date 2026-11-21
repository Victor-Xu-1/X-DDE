"""Check desktop navigation, native canvases and result controls on retained studies."""

import os
from pathlib import Path
from urllib.parse import urljoin

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


def verify_result_workspace(page, capability, zh, *, del_candidates=False):
    workbench = page.locator(".detail-panel .structure-workbench:visible")
    if capability == "del.enumerate":
        panel = ".candidate-inspection-preview" if del_candidates else ".dataset-member-inspector"
        preview = workbench.locator(f"{panel} .figure-preview-sheet:visible")
        preview.evaluate("node => node.scrollIntoView({block: 'center'})")
        image = preview.locator("img")
        expect(image).to_be_visible(timeout=35_000)
        image.evaluate("node => node.decode()")
    else:
        capture = workbench.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
        )
        expect(capture).to_be_enabled(timeout=35_000)
        preview = workbench.locator(".molecular-stage iframe:visible")

    page.evaluate("async () => { await document.fonts.ready; window.scrollTo(0, 0); }")
    expect(preview).to_be_in_viewport(ratio=0.96)
    stage = preview.bounding_box()
    details = workbench.locator(".structure-workbench-details")
    rail = details.bounding_box()
    first = details.locator("tbody tr:visible").first.bounding_box()
    assert stage and rail and first
    assert stage["width"] >= 350 and stage["width"] > rail["width"]
    assert stage["x"] + stage["width"] < rail["x"]
    assert first["y"] + first["height"] <= page.viewport_size["height"]

    if capability == "drugclip.index":
        actions = workbench.locator(".dataset-member-actions")
        download = actions.get_by_role("link", name="下载 MOL" if zh else "Download MOL")
        save = actions.get_by_role("button", name="保存文件" if zh else "Save file")
        expect(download.locator("svg")).to_be_visible()
        expect(save.locator("svg")).to_be_visible()
        expect(download).to_be_in_viewport()
        expect(save).to_be_in_viewport()
        source = download.get_attribute("href")
        assert source and "report_sha256=" in source
        response = page.request.get(urljoin(page.url, source))
        assert response.ok and "M  END" in response.text()
    if capability == "plip.profile":
        export = details.get_by_role(
            "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True,
        )
        assert export.bounding_box()["width"] <= 40
        row = details.locator('tbody tr[tabindex="0"]').first
        residue = row.locator(".interaction-residue").inner_text()
        row.press("Enter")
        expect(row).to_have_attribute("aria-selected", "true")
        selection = workbench.get_by_role(
            "group", name="当前结构选择" if zh else "Current structure selection",
        )
        expect(selection.get_by_text(residue, exact=True)).to_be_visible()


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "light", 1001, 650),
    ("en", "warm", 1024, 600),
    ("en", "warm", 1024, 650),
    ("zh", "dark", 1024, 650),
    ("en", "light", 1024, 720),
    ("en", "warm", 1080, 650),
    ("zh", "dark", 1120, 650),
    ("en", "light", 1440, 900),
])
def test_retained_result_headers_at_desktop_sizes(language, theme, width, height):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = Path("outputs/candidate-inspection") / (
        f"result-workbench-{width}x{height}-{language}"
    )
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
        cases = (*CASES, "del.enumerate") if width < 1080 else CASES
        for capability in cases:
            load_case(page, base, capability, settings)
            header = page.locator(".detail-panel.has-header-navigation > .task-detail-header")
            back, refresh, title = verify_header(header, width < 1200, zh)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if width < 1080:
                verify_result_workspace(page, capability, zh)
                if capability == "del.enumerate":
                    page.screenshot(path=evidence / "del.members.png")
                    page.get_by_role(
                        "tab", name="候选结构" if zh else "Candidate structures", exact=True,
                    ).click()
                    verify_result_workspace(page, capability, zh, del_candidates=True)
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
                history = page.get_by_role(
                    "heading", name="任务结果" if zh else "Task results", level=2, exact=True,
                )
                expect(history).to_be_focused()
                expect(header).to_have_count(0)
            else:
                page.screenshot(path=evidence / f"{capability}.png")
        assert writes == []
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()
