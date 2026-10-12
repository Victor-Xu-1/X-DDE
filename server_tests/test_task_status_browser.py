"""Real Chromium fault flows over controlled read-only API responses; no science jobs."""

import json
import os
import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/task-status")
A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"


def job(task_id, status="running"):
    return {
        "id": task_id,
        "status": status,
        "request": {
            "operation": "properties",
            "name": "Browser control task " + ("A" if task_id == A else "B"),
            "smiles": ["CCO"],
            "ligand_files": [],
        },
        "created_at": "2026-10-12T01:00:00Z",
        "started_at": "2026-10-12T01:01:00Z",
        "finished_at": "2026-10-12T01:02:00Z" if status == "failed" else None,
        "error": "Controlled task failure" if status == "failed" else None,
        "parent_id": None,
    }


@pytest.fixture
def fixture_page(request, language, width):
    root = EVIDENCE / request.node.name
    root.mkdir(parents=True, exist_ok=True)
    state = {
        "health_failed": False,
        "jobs_failed": False,
        "status_failed": False,
        "hold_artifacts": False,
        "hold_a": False,
        "statuses": {A: "running", B: "running"},
    }
    counts, errors, mutations, cancelled = Counter(), [], [], []
    screenshots = []
    held_routes = []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.clock.install(time=datetime(2026, 10, 12, tzinfo=UTC))
        page.clock.pause_at(datetime(2026, 10, 12, 0, 1, tzinfo=UTC))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda value: cancelled.append(urlsplit(value.url).path))

        def capture(name, caption):
            filename = name + ".png"
            page.screenshot(path=root / filename, full_page=True)
            screenshots.append(
                {
                    "file": filename,
                    "caption": caption,
                    "language": language,
                    "viewport": {"width": width, "height": 1000},
                    "task_route": urlsplit(page.url).fragment,
                    "visible_task_titles": page.locator(".detail-panel h2").all_text_contents(),
                    "visible_task_status": page.locator(
                        ".detail-panel .status"
                    ).all_text_contents(),
                    "read_warnings": page.locator("[data-read-error]").all_text_contents(),
                    "controlled_response_statuses": dict(state["statuses"]),
                    "controlled_api_fixture": True,
                    "scientific_inference": False,
                }
            )

        def respond(route):
            path = urlsplit(route.request.url).path.removeprefix("/api")
            counts[path] += 1
            if route.request.method != "GET":
                mutations.append(path)
                route.fulfill(status=405, json={"detail": "Read-only control fixture"})
                return
            if path == "/jobs":
                route.fulfill(
                    status=503 if state["jobs_failed"] else 200,
                    json={"detail": "Controlled disconnection"}
                    if state["jobs_failed"]
                    else [job(A), job(B)],  # Deliberately stale list snapshots.
                )
            elif path == "/health":
                route.fulfill(
                    status=503 if state["health_failed"] else 200,
                    json={"detail": "Controlled health failure"}
                    if state["health_failed"]
                    else {
                        "engine": {"ready": True, "gpu": None, "reason": None},
                        "worker_ready": True,
                        "worker_error": None,
                        "version": "browser-control-fixture",
                        "free_disk_gib": 100,
                        "disk_total_gib": 200,
                        "capabilities": {"prediction": False, "msa": False, "templates": False},
                    },
                )
            elif path in (f"/jobs/{A}", f"/jobs/{B}"):
                task_id = path.rsplit("/", 1)[1]
                if state["hold_a"] and task_id == A:
                    held_routes.append(route)
                    return
                route.fulfill(
                    status=503 if state["status_failed"] else 200,
                    json={"detail": "Controlled disconnection"}
                    if state["status_failed"]
                    else job(task_id, state["statuses"][task_id]),
                )
            elif path in (f"/jobs/{A}/artifacts", f"/jobs/{B}/artifacts"):
                if state["hold_artifacts"] or (state["hold_a"] and A in path):
                    held_routes.append(route)
                    return
                route.fulfill(json=[])
            elif path.startswith("/task-history/") and path.endswith("/identity"):
                task_id = path.split("/")[2]
                route.fulfill(
                    json={
                        "job_id": task_id,
                        "capability_id": "properties",
                        "origin": "research",
                        "example_cases": [],
                    }
                )
            elif path == "/task-history":
                route.fulfill(
                    json={
                        "items": [
                            {"job": job(value), "capability_id": "properties"} for value in (A, B)
                        ],
                        "counts": {"properties": {"total": 2, "active": 2}},
                        "total": 2,
                        "offset": 0,
                        "limit": 20,
                    }
                )
            elif path == "/projects":
                route.fulfill(json=[])
            else:
                # Inactive workspace metadata remains explicitly unavailable.
                route.fulfill(status=503, json={"detail": "Outside this read-only fixture"})

        page.route("**/api/**", respond)
        try:
            yield page, state, counts, cancelled, capture
            assert not errors, errors
            assert not mutations, mutations
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        finally:
            capture("final", "Final observed UI state; test assertions determine acceptance.")
            context.tracing.stop(path=root / "trace.zip")
            (root / "acceptance.json").write_text(
                json.dumps(
                    {
                        "language": language,
                        "width": width,
                        "controlled_api_fixture": True,
                        "scientific_inference": False,
                        "request_counts": dict(counts),
                        "cancelled_requests": cancelled,
                        "mutations": mutations,
                        "page_errors": errors,
                        "screenshots": screenshots,
                    },
                    indent=2,
                )
            )
            context.close()
            browser.close()


def open_task(page, status_pending=False):
    with page.expect_response(lambda response: urlsplit(response.url).path == "/api/health"):
        page.goto(os.environ["WB_BROWSER_URL"] + "/#task=" + A)
    expect(page.locator(".detail-panel h2")).to_have_text("Browser control task A")
    if not status_pending:
        expect(
            page.get_by_text(re.compile("Refreshing task status|正在更新任务状态"))
        ).to_have_count(0)


def expect_cancelled(page, cancelled, *paths):
    # Network cancellation events can follow the React error/selection commit.
    for _ in range(100):
        if all(path in cancelled for path in paths):
            return
        page.wait_for_timeout(20)
    assert all(path in cancelled for path in paths), cancelled


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_health_outage_does_not_hide_terminal_status(fixture_page, language, width):
    page, state, counts, _, capture = fixture_page
    open_task(page)
    state["health_failed"] = True
    state["statuses"][A] = "failed"
    page.clock.run_for(3500)
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )
    expect(page.get_by_text("Controlled task failure", exact=True)).to_be_visible()
    page.clock.run_for(6500)  # The health stream has its own ten-second cadence.
    expect(page.locator('[data-read-error="health"]')).to_be_visible()
    capture("health-outage", "Confirmed task failure with an independent service-health warning.")
    assert counts[f"/jobs/{A}"] >= 2 and counts["/jobs"] >= 2
    # Even later stale replies cannot undo the confirmed terminal lifecycle.
    state["statuses"][A] = "running"
    page.clock.run_for(6000)
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )
    assert counts["/health"] == 2  # Failed stream waits for explicit Retry.


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_artifact_deadline_preserves_live_status_and_retry(fixture_page, language, width):
    page, state, counts, cancelled, capture = fixture_page
    state["hold_artifacts"] = True
    open_task(page)
    expect(
        page.get_by_text("正在读取任务文件…" if language == "zh" else "Loading task files…")
    ).to_be_visible()
    state["statuses"][A] = "failed"
    page.clock.run_for(2000)
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )
    capture(
        "files-pending", "Task failure is visible while the optional file read is still pending."
    )
    page.clock.run_for(28000)
    warning = page.locator('[data-read-error="artifacts"]')
    expect(warning).to_be_visible()
    assert counts[f"/jobs/{A}/artifacts"] == 1
    expect_cancelled(page, cancelled, f"/api/jobs/{A}/artifacts")
    assert counts[f"/jobs/{A}"] >= 2
    capture(
        "files-timeout", "File timeout has a Retry action while the confirmed task failure remains."
    )
    state["hold_artifacts"] = False
    warning.get_by_role("button", name="重试" if language == "zh" else "Retry", exact=True).click()
    expect(warning).to_have_count(0)
    assert counts[f"/jobs/{A}/artifacts"] == 2
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_disconnection_keeps_honest_last_state_until_retry(fixture_page, language, width):
    page, state, counts, _, capture = fixture_page
    open_task(page)
    state["jobs_failed"] = state["status_failed"] = True
    page.clock.run_for(3500)
    warning = page.locator('[data-read-error="status"]')
    expect(warning).to_contain_text(
        "最后确认的状态" if language == "zh" else "last confirmed state"
    )
    expect(page.locator(".detail-panel .status")).to_have_text(
        "运行中" if language == "zh" else "Running"
    )
    capture(
        "status-disconnected", "Last-confirmed Running state is explicitly marked stale with Retry."
    )
    status_count = counts[f"/jobs/{A}"]
    page.clock.run_for(10000)
    assert counts[f"/jobs/{A}"] == status_count
    state["jobs_failed"] = state["status_failed"] = False
    state["statuses"][A] = "failed"
    warning.get_by_role("button", name="重试" if language == "zh" else "Retry", exact=True).click()
    expect(warning).to_have_count(0)
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_new_selection_cancels_old_metadata_and_files(fixture_page, language, width):
    page, state, counts, cancelled, capture = fixture_page
    state["hold_a"] = True
    state["statuses"][B] = "failed"
    open_task(page, status_pending=True)
    capture(
        "selection-pending",
        "Task A is visible from the list while its status and files are pending.",
    )
    picker = page.locator(".task-picker")
    picker.locator("summary").click()
    picker.get_by_role("button", name="Browser control task B", exact=True).click()
    expect(page.locator(".detail-panel h2")).to_have_text("Browser control task B")
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )
    expect(page).to_have_url(re.compile("task=" + B))
    expect_cancelled(page, cancelled, f"/api/jobs/{A}", f"/api/jobs/{A}/artifacts")
    expect(
        page.get_by_text("正在读取任务文件…" if language == "zh" else "Loading task files…")
    ).to_have_count(0)
    # Keep observing beyond A's cancelled 30-second deadlines. One 35-second
    # clock jump can time out B's new fetch before the real route/body transport
    # settles. Advance normal poll intervals, requiring both healthy B responses
    # to finish before advancing again; the production deadline stays unchanged.
    for _ in range(18):
        with (
            page.expect_response(
                lambda response: urlsplit(response.url).path == f"/api/jobs/{B}"
            ) as status_response,
            page.expect_response(
                lambda response: urlsplit(response.url).path == f"/api/jobs/{B}/artifacts"
            ) as files_response,
        ):
            page.clock.run_for(2000)
        assert status_response.value.status == files_response.value.status == 200
        status_response.value.finished()
        files_response.value.finished()
        assert status_response.value.json()["id"] == B
        assert files_response.value.json() == []
    assert counts[f"/jobs/{A}"] == counts[f"/jobs/{A}/artifacts"] == 1
    assert counts[f"/jobs/{B}"] >= 19 and counts[f"/jobs/{B}/artifacts"] >= 19
    assert f"/api/jobs/{B}" not in cancelled
    assert f"/api/jobs/{B}/artifacts" not in cancelled
    expect(page.locator(".detail-panel h2")).to_have_text("Browser control task B")
    expect(page.locator(".detail-panel .status")).to_have_text(
        "失败" if language == "zh" else "Failed"
    )
    expect(page.locator('[data-read-error="status"]')).to_have_count(0)
    expect(page.locator('[data-read-error="artifacts"]')).to_have_count(0)
