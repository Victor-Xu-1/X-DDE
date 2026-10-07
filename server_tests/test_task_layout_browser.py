"""Walk every task module and genuine archived case in Chromium, without computation."""

import os
import sqlite3
from pathlib import Path

from layout_browser_helpers import (
    VISIBLE_TASKS,
    capture,
    capture_utilities,
    catalog,
    load_template,
    review_steps,
    save_report,
)
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES


def test_every_task_page_and_native_case_layout():
    selected_width = os.environ.get("WB_LAYOUT_WIDTH")
    if selected_width is not None and selected_width not in {"1440", "390"}:
        raise ValueError("Choose the reviewed desktop or mobile layout width.")
    widths = (int(selected_width),) if selected_width else (1440, 390)
    selected_shard = os.environ.get("WB_LAYOUT_SHARD")
    if selected_shard is not None and selected_shard not in {"0", "1"}:
        raise ValueError("Choose a reviewed task group, 0 or 1.")
    shard = int(selected_shard) if selected_shard is not None else None
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    errors = []
    rows = []
    names = []
    task_submissions = []
    db = sqlite3.connect(Path(os.environ["WB_STATE_DIR"]) / "jobs.sqlite3")
    original = db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()
    with sync_playwright() as engine:
        browser = engine.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                task_submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            examples = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/examples").json()[
                "examples"
            ]
            input_only = {
                CAPABILITIES[item["module"]["capability_id"]].label[0]
                for item in examples
                if not item["computed_result_available"]
            }
            expect(page.locator(".tool-card")).to_have_count(VISIBLE_TASKS)
            names = page.locator(".tool-card h2").all_text_contents()
            expected = {
                spec.label[0]
                for key, spec in CAPABILITIES.items()
                if spec.frontend_form and key != "resources"
            }
            assert set(names) == expected and len(names) == len(expected)
            if shard is not None:
                names = [name for index, name in enumerate(names) if index % 2 == shard]
            for width in widths:
                page.set_viewport_size({"width": width, "height": 1000})
                for name in names:
                    catalog(page)
                    page.get_by_role("button", name=name, exact=True).and_(
                        page.locator(".tool-card")
                    ).click()
                    expect(page.locator(".module-template:visible")).to_be_visible()
                    rows.append(capture(page, evidence, name, "new"))
                    # Expert fields are a separate UI state, never a launched task.
                    expert = page.get_by_role("button", name="专家模式", exact=True)
                    if expert.count() == 1 and expert.is_visible():
                        expert.click()
                        rows.append(capture(page, evidence, name, "expert"))
                        guided = page.get_by_role("button", name="简易模式", exact=True)
                        if guided.count() == 1:
                            guided.click()
                    load_template(page)
                    rows.extend(review_steps(page, evidence, name))
                    results = page.get_by_role("button", name="示例结果", exact=True)
                    if results.count() == 0:
                        results = page.get_by_role("button", name="配置示例", exact=True)
                    if results.count() == 0 and name in input_only:
                        expect(
                            page.get_by_role("button", name="新建空白任务", exact=True)
                        ).to_be_visible()
                        rows.append(capture(page, evidence, name, "reviewed-input-template"))
                        continue
                    expect(results).to_be_visible()
                    results.click()
                    expect(
                        page.get_by_role("region", name="模块内示例结果", exact=True)
                    ).to_be_visible()
                    expect(page.get_by_text("正在读取结果…", exact=True)).not_to_be_visible(
                        timeout=30000
                    )
                    rows.append(capture(page, evidence, name, "result"))
                if shard in {None, 0}:
                    rows.extend(capture_utilities(page, evidence, width))
            assert not errors, errors
            assert not task_submissions, "A layout check must never submit science tasks"
            assert db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall() == original
        finally:
            save_report(
                evidence,
                rows,
                errors,
                {
                    "revision": os.environ.get("GITHUB_SHA"),
                    "widths": widths,
                    "shard": shard,
                    "selected_tasks": names,
                },
            )
            browser.close()
            db.close()
