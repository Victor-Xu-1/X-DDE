"""Shared navigation, task context and search over the actual restored platform."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/navigation-shell")
DESTINATIONS = [
    ("靶点研究", "Target research"),
    ("结构预测", "Structure prediction"),
    ("口袋与对接", "Pockets and docking"),
    ("小分子设计", "Small-molecule design"),
    ("诱导邻近设计", "Induced proximity"),
    ("高通量筛选", "High-throughput screening"),
    ("DEL 研究", "DEL research"),
    ("生物药研究", "Biologics research"),
    ("性质与安全性", "Properties and safety"),
    ("研究空间", "Research workspace"),
    ("任务与结果", "Tasks and results"),
    ("全部能力", "All capabilities"),
]


@pytest.fixture
def shell_page():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(os.environ["WB_BROWSER_URL"])
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        yield page
        assert not errors, errors
        assert not submissions, "Navigation submitted research or installation"
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()


def open_navigation(page, language):
    if page.viewport_size["width"] <= 960:
        page.get_by_role(
            "button",
            name="打开研究导航" if language == "zh" else "Open research navigation",
            exact=True,
        ).click()
        expect(
            page.get_by_role(
                "dialog", name="研究导航" if language == "zh" else "Research navigation", exact=True
            )
        ).to_be_visible()
    return page.get_by_role(
        "navigation", name="主导航" if language == "zh" else "Main navigation", exact=True
    )


def settings(page, language):
    open_navigation(page, language)
    page.get_by_role(
        "button", name="设置与帮助" if language == "zh" else "Settings and help", exact=True
    ).click()
    page.get_by_role(
        "menuitem", name="界面设置" if language == "zh" else "Appearance and language", exact=True
    ).click()
    expect(page.locator("#settings-language")).to_be_visible()


def capture(page, name):
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    page.screenshot(path=EVIDENCE / (name + ".png"))


def test_every_research_destination_has_full_navigation_and_visible_context(shell_page):
    page = shell_page
    measurements = []
    for language in ("zh", "en"):
        if language == "en":
            settings(page, "zh")
            page.locator("#settings-language").select_option("en")
        for width in (1440, 768, 390, 320):
            page.set_viewport_size({"width": width, "height": 1000})
            for index, labels in enumerate(DESTINATIONS):
                label = labels[0 if language == "zh" else 1]
                nav = open_navigation(page, language)
                button = nav.get_by_role("button", name=label, exact=True)
                expect(button.locator("span:not(.anticon)").first).to_be_visible()
                if width <= 960:
                    dialog = page.get_by_role(
                        "dialog",
                        name="研究导航" if language == "zh" else "Research navigation",
                        exact=True,
                    )
                    assert dialog.bounding_box()["width"] <= width - 30
                    button.scroll_into_view_if_needed()
                    if index == 5:
                        capture(page, f"navigation-{language}-{width}")
                button.click()
                expect(page.locator(".page-context-title")).to_have_text(label)
                expect(page.locator(".page-context-title")).to_be_visible()
                if width <= 960:
                    expect(page.get_by_role("dialog")).to_have_count(0)
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                if index in (0, 1, 5, 7, 11):
                    capture(page, f"{language}-{width}-destination-{index}")
                measurements.append(
                    {
                        "language": language,
                        "width": width,
                        "destination": label,
                        "visible_context": True,
                    }
                )
        settings(page, language)
        page.get_by_role("radio", name="深色" if language == "zh" else "Dark", exact=True).check()
        page.set_viewport_size({"width": 390, "height": 1000})
        open_navigation(page, language)
        capture(page, f"navigation-{language}-dark-390")
        page.keyboard.press("Escape")
        expect(
            page.get_by_role(
                "button",
                name="打开研究导航" if language == "zh" else "Open research navigation",
                exact=True,
            )
        ).to_be_focused()
        page.get_by_role("radio", name="浅色" if language == "zh" else "Light", exact=True).check()
    (EVIDENCE / "destinations.json").write_text(
        json.dumps(measurements, ensure_ascii=False, indent=2)
    )


def test_navigation_and_search_preserve_inputs_and_select_exact_existing_tasks(shell_page):
    page = shell_page
    page.set_viewport_size({"width": 390, "height": 1000})
    nav = open_navigation(page, "zh")
    nav.get_by_role("button", name="结构预测", exact=True).click()
    page.get_by_role("radio", name="蛋白结构", exact=True).check()
    page.get_by_role("button", name="下一步", exact=True).click()
    sequence = page.locator(".questionnaire:visible textarea")
    expect(sequence).to_have_count(1)
    value = (
        "SMNPPPPETSNPNKPKRQTNQLQYLLRVVLKTLWKHQFAWPFQQPVDAVKLNLPDYYKIIKTPMDMGTIKKRLENNYYWNAQECIQDFNT"
    )
    sequence.fill(value)
    opener = page.get_by_role("button", name="打开研究导航", exact=True)
    opener.click()
    for _ in range(16):
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('dialog') != null")
    page.keyboard.press("Escape")
    expect(opener).to_be_focused()
    expect(sequence).to_have_value(value)
    opener.click()
    page.mouse.click(370, 300)
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(sequence).to_have_value(value)
    capture(page, "preserved-input-390")

    search_trigger = page.get_by_role("button", name="搜索任务", exact=True)
    search_trigger.click()
    search = page.get_by_role("searchbox", name="搜索任务", exact=True)
    expect(search).to_be_focused()
    search.fill("no-existing-research-task")
    expect(page.get_by_role("status").filter(has_text="没有匹配的任务")).to_be_visible()
    capture(page, "search-empty-390")
    page.keyboard.press("Escape")
    expect(search_trigger).to_be_focused()
    expect(sequence).to_have_value(value)

    base = os.environ["WB_BROWSER_URL"]
    job_id = page.request.get(base + "/api/examples/esm").json()["pin"]["job_id"]
    search_trigger.click()
    search.fill(job_id)
    result = page.get_by_role("region", name="任务搜索结果", exact=True)
    expect(result.get_by_role("button")).to_have_count(1)
    page.keyboard.press("ArrowDown")
    expect(result.get_by_role("button")).to_be_focused()
    capture(page, "search-real-result-390")
    page.keyboard.press("Enter")
    expect(page).to_have_url(base + "/#task=" + job_id)
    expect(page.locator(".page-context-title")).to_have_text("任务与结果")
    expect(page.locator(".sequence-score-results")).to_be_visible(timeout=30000)
    capture(page, "selected-existing-task-390")

    page.set_viewport_size({"width": 1440, "height": 1000})
    expect(search).to_be_visible()
    search.fill("no-existing-research-task")
    page.keyboard.press("Escape")
    expect(search).to_be_focused()
    expect(search).to_have_value("")
