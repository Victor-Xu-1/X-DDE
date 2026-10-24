"""Questionnaire refresh/back with controlled read-only API; no scientific acceptance."""

import os
import re
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect

from server_tests.test_task_status_browser import A, B
from server_tests.test_task_status_browser import fixture_page as status_fixture_page

fixture_page = status_fixture_page

CASES = [
    ("p2rank.detect", "口袋与对接", "Pockets and docking"),
    ("deepternary.model", "诱导邻近设计", "Induced proximity"),
    ("boltzgen.design", "生物药研究", "Biologics research"),
]


def empty_history(page):
    page.route(
        "**/api/task-history?**",
        lambda route: route.fulfill(
            json={
                "items": [],
                "counts": {},
                "total": 0,
                "offset": 0,
                "limit": 20,
            }
        ),
    )


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_refresh_and_back_restore_each_selected_questionnaire(fixture_page, language, width):
    page, _, counts, _, capture = fixture_page
    empty_history(page)
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    for tool, title_zh, title_en in CASES:
        initial = "#view=new&tool=" + tool
        page.goto(base + "/" + initial)
        picker = page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        )
        expect(picker).to_have_value(tool)
        expect(page.locator(".page-context-title")).to_have_text(title_zh if zh else title_en)
        page.reload()
        expect(picker).to_have_value(tool)
        workspace = page.get_by_role(
            "navigation", name="模块工作区" if zh else "Module workspace", exact=True
        )
        workspace.get_by_role(
            "button", name="任务结果" if zh else "Task results", exact=True
        ).click()
        expect(page).to_have_url(re.compile(r"#view=results&module="))
        page.go_back()
        expect(picker).to_have_value(tool)
        assert urlsplit(page.url).fragment == initial[1:]
        capture(
            tool.replace(".", "-"),
            "Registered questionnaire restored after reload and browser Back; "
            "no historical input or new task.",
        )
    assert counts[f"/jobs/{A}"] == counts[f"/jobs/{B}"] == 0
    assert counts[f"/jobs/{A}/artifacts"] == counts[f"/jobs/{B}/artifacts"] == 0


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_new_task_keeps_prior_result_filter_and_ignores_stale_task(fixture_page, language, width):
    page, _, counts, _, capture = fixture_page
    empty_history(page)
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    previous = "#view=results&module=binding&q=STAT6"
    page.goto(base + "/" + previous)
    workspace = page.get_by_role(
        "navigation", name="模块工作区" if zh else "Module workspace", exact=True
    )
    workspace.get_by_role("button", name="新建任务" if zh else "New task", exact=True).click()
    picker = page.get_by_role("combobox", name="研究任务" if zh else "Research task", exact=True)
    expect(picker).to_have_value("p2rank.detect")
    page.go_back()
    expect(page).to_have_url(re.compile(r"#view=results&module=binding"))
    assert parse_qs(urlsplit(page.url).fragment)["q"] == ["STAT6"]
    page.go_forward()
    expect(picker).to_have_value("p2rank.detect")
    page.goto(base + "/#view=new&tool=deepternary.model&task=" + A)
    expect(picker).to_have_value("deepternary.model")
    assert counts[f"/jobs/{A}"] == counts[f"/jobs/{B}"] == 0
    capture(
        "new-route-selection-isolation",
        "Results filter remains in browser history; "
        "an explicit new route never reads the attached stale task.",
    )
