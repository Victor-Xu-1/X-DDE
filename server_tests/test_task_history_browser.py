"""Exact module/history interactions over real API/SQLite and native retained outputs."""

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/task-history")


def navigation(page, language):
    nav = page.get_by_role(
        "navigation", name="主导航" if language == "zh" else "Main navigation", exact=True
    )
    if page.viewport_size["width"] <= 960 and not nav.is_visible():
        page.get_by_role(
            "button",
            name="打开研究导航" if language == "zh" else "Open research navigation",
            exact=True,
        ).click()
    return nav


def open_list(page):
    picker = page.locator(".task-picker")
    if not picker.evaluate("node => node.open"):
        picker.locator("summary").click()


def open_module_results(page, language, module):
    labels = {
        "evaluation": ("性质与安全性", "Properties and safety"),
        "binding": ("口袋与对接", "Pockets and docking"),
        "simulations": ("动力学与 FEP", "Dynamics and FEP"),
    }
    zh = language == "zh"
    navigation(page, language).get_by_role(
        "button", name=labels[module][0 if zh else 1], exact=True
    ).click()
    workspace = page.get_by_role(
        "navigation", name="模块工作区" if zh else "Module workspace", exact=True
    )
    workspace.get_by_role("button", name="任务结果" if zh else "Task results", exact=True).click()
    expect(
        workspace.get_by_role("button", name="任务结果" if zh else "Task results", exact=True)
    ).to_have_attribute("aria-pressed", "true")


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
        expect(
            navigation(page, language).get_by_role(
                "button", name="任务与结果" if zh else "Tasks and results", exact=True
            )
        ).to_have_count(0)
        open_module_results(page, language, "evaluation")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
        page.screenshot(path=root / "module-results.png")
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
        assert parse_qs(urlsplit(page.url).fragment)["task"] == [oldest["id"]]
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
        page.reload()
        expect(page.locator(".page-context-title")).to_have_text(
            "性质与安全性" if zh else "Properties and safety"
        )
        assert parse_qs(urlsplit(page.url).fragment)["module"] == ["evaluation"]
        expect(search).to_have_value(oldest["name"])
        expect(rows).to_have_count(1)
        expect(page.locator(".pocket-explorer")).to_have_count(0)
        page.screenshot(path=root / "filtered-history.png")
        open_module_results(page, language, "binding")
        page.get_by_role("button", name=fixture["native_name"], exact=True).click()
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)
        expect(page.locator(".page-context-title")).to_have_text(
            "口袋与对接" if zh else "Pockets and docking"
        )
        expect(page.get_by_role("heading", name=fixture["native_name"], exact=True)).to_be_visible()
        page.screenshot(path=root / "native-result.png")
        page.reload()
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)
        assert parse_qs(urlsplit(page.url).fragment)["module"] == ["binding"]

        # A failed new-module read must not revive the old module's result.
        def unavailable(route):
            route.fulfill(
                status=503,
                content_type="application/json",
                body=json.dumps({"detail": "Controlled internal /private/state failure"}),
            )

        # A managed environment probe must not block available research history.
        page.route("**/api/health", unavailable)
        with page.expect_response("**/api/health") as failed_health:
            page.reload()
        assert failed_health.value.status == 503
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)
        workspace = page.locator(".task-history-workspace")
        expect(workspace.get_by_role("alert")).to_have_count(0)
        open_module_results(page, language, "evaluation")
        expect(rows).to_have_count(20)
        expect(workspace.get_by_role("alert")).to_have_count(0)
        expect(workspace).not_to_contain_text("/private/state")
        page.screenshot(path=root / "history-during-health-failure.png")
        page.unroute("**/api/health", unavailable)
        health_warning = page.locator('[data-read-error="health"]')
        expect(health_warning).to_be_visible()
        health_warning.get_by_role("button", name="重试" if zh else "Retry", exact=True).click()
        expect(health_warning).to_have_count(0)
        open_module_results(page, language, "binding")
        page.get_by_role("button", name=fixture["native_name"], exact=True).click()
        expect(page.locator(".pocket-explorer")).to_be_visible(timeout=30000)

        page.route("**/api/task-history?*", unavailable)
        open_module_results(page, language, "evaluation")
        expect(page.get_by_role("alert")).to_contain_text("重新连接" if zh else "reconnect")
        expect(page.locator(".pocket-explorer")).to_have_count(0)
        expect(page.locator(".task-history-workspace")).not_to_contain_text("/private/state")
        page.unroute("**/api/task-history?*", unavailable)
        page.get_by_role("button", name="重新连接" if zh else "Reconnect", exact=True).click()
        expect(rows).to_have_count(20)
        open_module_results(page, language, "simulations")
        expect(
            page.get_by_role(
                "heading",
                name="这个模块还没有任务" if zh else "No tasks in this module yet",
                exact=True,
            )
        ).to_be_visible()
        page.get_by_role(
            "navigation", name="模块工作区" if zh else "Module workspace", exact=True
        ).get_by_role("button", name="新建任务" if zh else "New task", exact=True).click()
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
        # An archived native example uses its verified case, including record-pin
        # evidence. A personal clone above retains the exact researcher title.
        page.goto(base + "/#task=" + fixture["native_source_job"])
        case_title = fixture["native_case_label"][0 if zh else 1]
        expect(page.get_by_role("heading", name=case_title, exact=True)).to_be_visible(
            timeout=15000
        )
        identity = page.request.get(
            base + "/api/task-history/" + fixture["native_source_job"] + "/identity"
        ).json()
        assert identity["job_id"] == fixture["native_source_job"]
        assert identity["origin"] == "fixed_example"
        original = page.request.get(base + "/api/jobs/" + fixture["native_source_job"]).json()
        assert original["request"]["name"] == fixture["native_original_name"]
        if fixture["native_original_name"] != case_title:
            expect(
                page.get_by_role("heading", name=fixture["native_original_name"], exact=True)
            ).not_to_be_visible()
        page.screenshot(path=root / "verified-case-title.png")
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
                    "history_available_during_health_failure": True,
                    "module_only_refresh_restored": True,
                    "scientific_inference": False,
                    "submitted_jobs": 0,
                    "verified_archived_case_title": case_title,
                    "original_task_name_preserved": True,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_confirmed_project_receipt_survives_list_failure_and_read_only_recovery(language, width):
    """Real browser; project responses are controlled fixtures, never scientific results."""
    zh = language == "zh"
    root = EVIDENCE / f"project-receipt-{language}"
    root.mkdir(parents=True, exist_ok=True)
    project = {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": f"Confirmed browser study {language}",
        "description": "Controlled project creation receipt",
        "created_at": "2026-10-13T00:00:00Z",
    }
    existing = {**project, "id": "22222222-2222-4222-8222-222222222222", "name": "Existing study"}
    state = {
        "projects": [existing] if zh else [],
        "reject_create": True,
        "hold_create": False,
        "fail_next_read": False,
        "hold_read": False,
        "post_count": 0,
        "get_count": 0,
    }
    held, errors, forbidden_mutations, screenshots = {}, [], [], []
    completed = False
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))

        def respond(route):
            path = urlsplit(route.request.url).path
            method = route.request.method
            if path != "/api/projects":
                if method not in {"GET", "HEAD"}:
                    forbidden_mutations.append({"path": path, "method": method})
                    route.fulfill(status=405, json={"detail": "Outside project browser fixture"})
                else:
                    route.continue_()
                return
            if method == "POST":
                state["post_count"] += 1
                assert route.request.post_data_json == {
                    "name": project["name"],
                    "description": project["description"],
                }
                if state["reject_create"]:
                    route.fulfill(status=503, json={"detail": "Controlled create failure"})
                elif state["hold_create"]:
                    held["create"] = route
                else:
                    raise AssertionError("Unexpected project POST after confirmed creation")
            elif method == "GET":
                state["get_count"] += 1
                if state["fail_next_read"]:
                    state["fail_next_read"] = False
                    route.fulfill(status=503, json={"detail": "Controlled project-list failure"})
                elif state["hold_read"]:
                    held["read"] = route
                else:
                    route.fulfill(json=state["projects"])
            else:
                forbidden_mutations.append({"path": path, "method": method})
                route.fulfill(status=405, json={"detail": "Unsupported project fixture method"})

        def projects_page():
            navigation(page, language).get_by_role(
                "button", name="研究空间" if zh else "Research workspace", exact=True
            ).click()
            page.get_by_role("button", name="项目" if zh else "Projects", exact=True).click()
            return page.locator(".project-workspace")

        def capture(name):
            page.screenshot(path=root / (name + ".png"), full_page=True)
            screenshots.append(name + ".png")

        page.route("**/api/**", respond)
        try:
            with page.expect_response("**/api/projects"):
                page.goto(os.environ["WB_BROWSER_URL"] + "/#task=")
            panel = projects_page()
            if zh:
                expect(
                    panel.get_by_role("button", name="Existing study", exact=False)
                ).to_be_visible()
            panel.get_by_role(
                "button", name="新建项目" if zh else "New project", exact=False
            ).click()
            dialog = page.get_by_role("dialog")
            name = dialog.get_by_role(
                "textbox", name="项目名称" if zh else "Project name", exact=True
            )
            description = dialog.get_by_role(
                "textbox", name="说明（可选）" if zh else "Description (optional)", exact=True
            )
            name.fill(project["name"])
            description.fill(project["description"])
            dialog.get_by_role(
                "button", name="创建项目" if zh else "Create project", exact=True
            ).click()
            expect(dialog.get_by_role("alert")).to_contain_text("Controlled create failure")
            expect(name).to_have_value(project["name"])
            expect(description).to_have_value(project["description"])
            assert state["post_count"] == 1
            state["reject_create"], state["hold_create"] = False, True
            with page.expect_request(
                lambda request: (
                    urlsplit(request.url).path == "/api/projects" and request.method == "POST"
                )
            ):
                dialog.get_by_role(
                    "button", name="创建项目" if zh else "Create project", exact=True
                ).click()
            expect(
                dialog.get_by_role("button", name="保存中…" if zh else "Saving…", exact=True)
            ).to_be_disabled()
            expect(
                dialog.get_by_role("button", name="取消" if zh else "Cancel", exact=True)
            ).to_be_disabled()
            name.press("Enter")
            page.keyboard.press("Escape")
            expect(dialog).to_be_visible()
            assert state["post_count"] == 2
            state["projects"] = [project, *state["projects"]]
            state["fail_next_read"] = True
            with page.expect_response(
                lambda response: (
                    urlsplit(response.url).path == "/api/projects"
                    and response.request.method == "GET"
                )
            ) as failed_read:
                held.pop("create").fulfill(status=201, json=project)
            assert failed_read.value.status == 503
            expect(dialog).to_have_count(0)
            panel = projects_page()
            row = panel.get_by_role("button", name=project["name"], exact=False)
            expect(row).to_be_visible()
            expect(row).to_have_class("project-row active")
            expect(panel.get_by_role("alert")).to_contain_text("Controlled project-list failure")
            expect(panel.get_by_role("status")).to_contain_text("已创建" if zh else "was created")
            expect(
                panel.get_by_role(
                    "button",
                    name="创建第一个项目" if zh else "Create your first project",
                    exact=True,
                )
            ).to_have_count(0)
            if zh:
                expect(
                    panel.get_by_role("button", name="Existing study", exact=False)
                ).to_be_visible()
            capture("confirmed-with-read-warning")
            # Return via another tab and module without another mutation or losing the receipt.
            page.get_by_role(
                "button", name="研究文件" if zh else "Research files", exact=True
            ).click()
            page.get_by_role("button", name="项目" if zh else "Projects", exact=True).click()
            navigation(page, language).get_by_role(
                "button", name="性质与安全性" if zh else "Properties and safety", exact=True
            ).click()
            panel = projects_page()
            expect(row).to_be_visible()
            assert state["get_count"] == 2 and state["post_count"] == 2
            state["hold_read"] = True
            with page.expect_request("**/api/projects"):
                panel.get_by_role("button", name="重试" if zh else "Retry", exact=True).click()
            expect(
                panel.get_by_role("button", name="重试中…" if zh else "Retrying…", exact=True)
            ).to_be_disabled()
            expect(panel.get_by_role("alert")).to_contain_text("Controlled project-list failure")
            expect(row).to_be_visible()
            state["hold_read"] = False
            held.pop("read").fulfill(json=state["projects"])
            expect(panel.get_by_role("alert")).to_have_count(0)
            expect(row).to_have_count(1)
            assert state["get_count"] == 3 and state["post_count"] == 2
            capture("read-only-recovery")
            page.reload()
            panel = projects_page()
            expect(panel.get_by_role("button", name=project["name"], exact=False)).to_be_visible()
            assert state["get_count"] == 4 and state["post_count"] == 2
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not errors, errors
            assert not forbidden_mutations, forbidden_mutations
            completed = True
        finally:
            capture("final")
            context.tracing.stop(path=root / "trace.zip")
            (root / "acceptance.json").write_text(
                json.dumps(
                    {
                        "language": language,
                        "viewport": {"width": width, "height": 1000},
                        "controlled_project_api_fixture": True,
                        "scientific_inference": False,
                        "assertions_completed": completed,
                        "post_attempts": state["post_count"],
                        "project_reads": state["get_count"],
                        "persisted_fixture_projects": state["projects"],
                        "forbidden_mutations": forbidden_mutations,
                        "page_errors": errors,
                        "screenshots": screenshots,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            context.close()
            browser.close()
