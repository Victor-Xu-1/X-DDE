"""Real App/LibraryForm/GuidedSteps, synthetic API receipts; no scientific work."""

import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.test_stat6_templates_browser import catalog

EVIDENCE = Path("server_tests/evidence/dataset-submission")
ASSET_ID = "11111111-1111-4111-8111-111111111111"
JOB_ID = "33333333-3333-4333-8333-333333333333"
ASSET = {
    "id": ASSET_ID,
    "name": "Submission lifecycle fixture.csv",
    "kind": "library",
    "suffix": ".csv",
    "size": 21,
    "sha256": "a" * 64,
    "created_at": "2026-10-12T00:00:00Z",
}


def review_library(page, zh):
    page.get_by_role("button", name="历史文件" if zh else "History", exact=True).click()
    page.get_by_role(
        "combobox", name="上传供应商或自有分子库" if zh else "Supplier or owned compound file"
    ).select_option(ASSET_ID)
    form = page.locator(".questionnaire:visible")
    for _ in range(3):
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    # Its accessible name changes while pending; keep tracking the same control.
    submit = form.locator('button[type="submit"]')
    expect(submit).to_have_accessible_name("提交任务" if zh else "Submit task")
    expect(submit).to_be_enabled()
    return form, submit


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
@pytest.mark.parametrize("fault", ["leave", "reopen", "navigation", "uncertain"])
def test_dataset_receipt_survives_interruption(tmp_path, language, width, fault):
    zh = language == "zh"
    evidence = EVIDENCE / f"{language}-{fault}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(tmp_path / "state", evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.tracing.start(screenshots=True, snapshots=True)
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        if fault == "navigation":
            page.add_init_script("""const replace = history.replaceState.bind(history);
              history.replaceState = (...args) => {
                if (!sessionStorage.getItem('dataset-view-fault') &&
                    /[#&]task=[0-9a-f-]{36}/.test(String(args[2]))) {
                  sessionStorage.setItem('dataset-view-fault', 'used');
                  throw new DOMException('Controlled view failure', 'SecurityError');
                }
                return replace(...args);
              };""")
        errors, writes, held, receipts = [], [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def transport(route):
            path = route.request.url.split("/api/", 1)[1].split("?", 1)[0]
            method = route.request.method
            if path == "jobs" and method == "POST":
                body = route.request.post_data_json
                writes.append({"body": body, "key": route.request.headers["idempotency-key"]})
                receipt = {
                    "id": JOB_ID,
                    "request": body,
                    "status": "queued",
                    "created_at": "2026-10-12T00:00:00Z",
                    "started_at": None,
                    "finished_at": None,
                    "parent_id": None,
                    "error": None,
                }
                receipts.append(receipt)
                if fault in {"leave", "reopen"}:
                    held.append(route)
                elif fault == "uncertain" and len(writes) == 1:
                    route.abort("failed")
                else:
                    route.fulfill(json=receipt)
                return
            if method != "GET":
                # A fixture must never dispatch real computation or cancellation.
                if path == "session":
                    route.continue_()
                else:
                    raise AssertionError(f"Unexpected mutation: {method} {path}")
                return
            if path == "assets":
                route.fulfill(json=[ASSET])
            elif path == f"datasets/files/{ASSET_ID}/preview":
                route.fulfill(
                    json={
                        "columns": ["ID", "SMILES"],
                        "rows": [{"ID": "one", "SMILES": "CCO"}],
                        "format": "csv",
                        "table": True,
                    }
                )
            elif path == "datasets/suppliers":
                route.fulfill(json=[])
            elif path == "capabilities/library.import":
                route.fulfill(json={"availability": {"configuration_present": True}})
            elif path == f"jobs/{JOB_ID}" and receipts:
                route.fulfill(json=receipts[0])
            elif path == f"jobs/{JOB_ID}/artifacts":
                route.fulfill(json=[])
            elif path == f"task-history/{JOB_ID}/identity":
                route.fulfill(
                    json={
                        "job_id": JOB_ID,
                        "capability_id": "library.import",
                        "origin": "research",
                        "example_cases": [],
                    }
                )
            else:
                route.continue_()

        page.route("**/api/**", transport)
        before = page.request.get(base + "/api/jobs").json()
        try:
            page.goto(base)
            catalog(page, language)
            page.locator('button[data-capability="library.import"]').click()
            form, submit = review_library(page, zh)
            submit.click()
            if fault in {"leave", "reopen"}:
                expect(submit).to_be_disabled()
                expect(submit).to_have_accessible_name("正在提交…" if zh else "Submitting…")
                for _ in range(100):
                    if held:
                        break
                    page.wait_for_timeout(10)
                assert len(held) == 1
                open_navigation(page, language).get_by_role(
                    "button", name="研究空间" if zh else "Research workspace", exact=True
                ).click()
                expect(page.locator(".dataset-workspace")).to_have_count(0)
                if fault == "reopen":
                    catalog(page, language)
                    page.locator('button[data-capability="library.import"]').click()
                    expect(page.locator(".dataset-workspace")).to_be_visible()
                newer_url = page.url
                with page.expect_response(lambda response: response.url == base + "/api/jobs"):
                    held.pop().fulfill(json=receipts[0])
                # Let fetch, React and history finish before checking for a stolen view.
                page.evaluate("() => new Promise(resolve => setTimeout(resolve, 100))")
                assert page.url == newer_url
                if fault == "reopen":
                    expect(
                        page.get_by_role(
                            "heading",
                            name="1. 选择材料" if zh else "1. Choose materials",
                            exact=True,
                        )
                    ).to_be_visible()
                    expect(page.get_by_role("alert")).to_have_count(0)
                else:
                    expect(page.locator(".dataset-workspace")).to_have_count(0)
            elif fault == "navigation":
                expect(form.get_by_role("alert")).to_contain_text(
                    "任务已创建" if zh else "Task created"
                )
                link = form.get_by_role(
                    "link",
                    name="查看任务进度与结果" if zh else "Open task progress and results",
                    exact=True,
                )
                expect(link).to_have_attribute("href", "/#task=" + JOB_ID)
                link.focus()
                expect(link).to_be_focused()
                page.screenshot(path=evidence / "accepted-receipt.png", full_page=True)
                link.press("Enter")
                expect(page).to_have_url(re.compile(r"[#&]task=" + JOB_ID))
            else:
                expect(form.get_by_role("alert")).to_contain_text(
                    "未能确认任务是否提交" if zh else "Task submission could not be confirmed"
                )
                submit.click()
                expect(page).to_have_url(re.compile(r"[#&]task=" + JOB_ID))
                assert len(writes) == 2 and writes[0] == writes[1]
            if fault in {"navigation", "uncertain"}:
                expect(
                    page.get_by_role(
                        "heading", name="任务与结果" if zh else "Tasks and results", exact=True
                    )
                ).to_be_visible()
                expect(
                    page.locator(".detail-panel").get_by_role(
                        "heading", name=receipts[0]["request"]["name"], exact=True
                    )
                ).to_be_visible()
            assert len(writes) == (2 if fault == "uncertain" else 1)
            assert writes[0]["body"]["inputs"][0]["source"] == {
                "asset_id": ASSET_ID,
                "sha256": ASSET["sha256"],
                "record": 0,
                "conformer": 0,
            }
            assert page.request.get(base + "/api/jobs").json() == before
            assert not errors, errors
            page.screenshot(path=evidence / "final-state.png", full_page=True)
            (evidence / "acceptance.json").write_text(
                json.dumps(
                    {
                        "sha": os.environ.get("GITHUB_SHA", "local"),
                        "browser": browser.version,
                        "language": language,
                        "viewport": {"width": width, "height": 1000},
                        "fault": fault,
                        "submissions": writes,
                        "final_url": page.url,
                        "data": "synthetic asset metadata and accepted API receipts",
                        "real_scientific_jobs": 0,
                        "errors": errors,
                    },
                    indent=2,
                )
            )
        finally:
            page.screenshot(path=evidence / "last-state.png", full_page=True)
            context.tracing.stop(path=evidence / "trace.zip")
            browser.close()
