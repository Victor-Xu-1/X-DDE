"""Exact module/history interactions over real API/SQLite and native retained outputs."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/task-history")


def navigation(page, language):
    if page.viewport_size["width"] <= 960:
        page.get_by_role(
            "button",
            name="打开研究导航" if language == "zh" else "Open research navigation",
            exact=True,
        ).click()
    return page.get_by_role(
        "navigation", name="主导航" if language == "zh" else "Main navigation", exact=True
    )


def open_list(page):
    picker = page.locator(".task-picker")
    if not picker.evaluate("node => node.open"):
        picker.locator("summary").click()


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_modules_filters_paging_linked_history_and_unchanged_native_result(language, width):
    zh = language == "zh"
    base = os.environ["WB_BROWSER_URL"]
    fixture = json.loads((EVIDENCE / "fixture.json").read_text(encoding="utf-8"))
    root = EVIDENCE / language
    root.mkdir(exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, mutations = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method == "POST" and "/api/jobs" in request.url
                else None
            ),
        )
        page.goto(base + "/#task=")
        before = page.request.get(base + "/api/task-history").json()["total"]
        navigation(page, language).get_by_role(
            "button", name="任务与结果" if zh else "Tasks and results", exact=True
        ).click()
        overview = page.get_by_role("group", name="任务模块" if zh else "Task modules", exact=True)
        expect(overview).to_contain_text("125", timeout=15000)
        expect(page.locator(".task-picker")).to_have_count(0)
        expect(overview.locator("button")).to_have_count(10)
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
        page.screenshot(path=root / "module-overview.png")
        overview.locator('[data-task-module="evaluation"]').click()
        rows = page.locator(".task-history-table tbody tr")
        expect(rows).to_have_count(20)
        expect(page.locator(".task-history-table")).not_to_contain_text(fixture["native_name"])
        pages = page.get_by_role("navigation", name="任务分页" if zh else "Task pages", exact=True)
        for index in range(6):
            pages.get_by_role("button", name="下一页" if zh else "Next", exact=True).click()
            expect(pages).to_contain_text(f"{index + 2} / 7")
        expect(rows).to_have_count(5)
        oldest = fixture["controlled_metadata_records"][0]
        page.get_by_role("button", name=oldest["name"], exact=True).click()
        expect(page.locator(".detail-panel h2")).to_have_text(oldest["name"], timeout=15000)
        assert page.url.endswith("#task=" + oldest["id"])
        assert (
            page.request.get(base + "/api/jobs/" + oldest["id"]).json()["request"]["name"]
            == oldest["name"]
        )
        open_list(page)
        expect(pages).to_contain_text("7 / 7")
        page.screenshot(path=root / "older-history.png")
        status = page.get_by_role("combobox", name="状态" if zh else "Status", exact=True)
        status.select_option("failed")
        expect(
            page.get_by_role(
                "heading", name="没有匹配的任务" if zh else "No matching tasks", exact=True
            )
        ).to_be_visible()
        expect(page.locator(".detail-panel")).to_have_count(0)
        page.get_by_role("button", name="清除筛选" if zh else "Clear filters", exact=True).click()
        expect(rows).to_have_count(20)
        search = page.get_by_role(
            "searchbox", name="搜索模块内任务" if zh else "Search this module", exact=True
        )
        search.fill(oldest["name"])
        expect(rows).to_have_count(1)
        expect(rows).to_contain_text(oldest["name"])
        page.screenshot(path=root / "filtered-history.png")
        switch = page.get_by_role(
            "combobox", name="切换任务模块" if zh else "Switch task module", exact=True
        )
        switch.select_option("binding")
        page.get_by_role("button", name=fixture["native_name"], exact=True).click()
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)
        expect(switch).to_have_value("binding")
        expect(page.get_by_role("heading", name=fixture["native_name"], exact=True)).to_be_visible()
        page.screenshot(path=root / "native-result.png")
        page.reload()
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)
        expect(switch).to_have_value("binding")

        # A failed new-module read must not revive the old module's result.
        def unavailable(route):
            route.fulfill(
                status=503,
                content_type="application/json",
                body=json.dumps({"detail": "Controlled internal /private/state failure"}),
            )

        page.route("**/api/task-history?*", unavailable)
        switch.select_option("evaluation")
        expect(page.get_by_role("alert")).to_contain_text("重新连接" if zh else "reconnect")
        expect(page.locator(".pocket-explorer")).to_have_count(0)
        expect(page.locator(".task-history-workspace")).not_to_contain_text("/private/state")
        page.unroute("**/api/task-history?*", unavailable)
        page.get_by_role("button", name="重新连接" if zh else "Reconnect", exact=True).click()
        expect(rows).to_have_count(20)
        switch.select_option("simulations")
        expect(
            page.get_by_role(
                "heading",
                name="这个模块还没有任务" if zh else "No tasks in this module yet",
                exact=True,
            )
        ).to_be_visible()
        page.get_by_role("button", name="新建任务" if zh else "New task", exact=True).click()
        expect(page.locator(".questionnaire:visible")).to_be_visible(timeout=15000)
        expect(
            page.get_by_role(
                "heading", name="1. 选择研究材料" if zh else "1. Choose research inputs", exact=True
            )
        ).to_be_visible()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
        for name, digest in fixture["artifact_sha256"].items():
            response = page.request.get(
                base + "/api/jobs/" + fixture["native_job"] + "/download", params={"name": name}
            )
            assert response.ok and hashlib.sha256(response.body()).hexdigest() == digest
        assert page.request.get(base + "/api/task-history").json()["total"] == before
        assert not errors, errors
        assert not mutations, mutations
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "personal_tasks": before,
                    "older_history_selected": oldest["id"],
                    "native_result": fixture["native_job"],
                    "native_artifacts_unchanged": True,
                    "module_switch_and_failure_recovery": True,
                    "scientific_inference": False,
                    "submitted_jobs": 0,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
