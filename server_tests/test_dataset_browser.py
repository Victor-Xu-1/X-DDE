"""Actual public outputs, real Ketcher/WebGL and single-step questionnaires; no model simulation."""

import os
from pathlib import Path

import pytest
from dataset_ui_fixture import public_server

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_DATASET_BROWSER") != "1",
    reason="Focused public-case browser acceptance runs on CI/server",
)


def test_all_data_modules_real_templates_results_and_questionnaire_navigation(tmp_path):
    from playwright.sync_api import sync_playwright

    server, thread = public_server(tmp_path)
    destination = Path("server_tests/evidence/dataset-browser")
    destination.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
            )
            page = browser.new_page(viewport={"width": 1500, "height": 1000}, device_scale_factor=1)
            failures = []
            page.on("pageerror", lambda error: failures.append(str(error)))
            page.goto("http://127.0.0.1:4320", wait_until="networkidle")
            context = page.request
            csrf = context.get("http://127.0.0.1:4320/api/session").json()["csrf_token"]
            modules = [
                key
                for key in context.get("http://127.0.0.1:4320/api/examples").json()["examples"]
                if key["module"]["capability_id"]
                in {
                    "library.import",
                    "library.select",
                    "drugclip.index",
                    "drugclip.screen",
                    "screening.dock",
                    "del.library",
                    "del.enumerate",
                    "del.decode",
                    "del.count",
                    "del.analyze",
                    "del.series",
                    "del.model",
                    "del.candidates",
                    "del.followup",
                }
            ]
            assert len(modules) == 14 and all(item["computed_result_available"] for item in modules)
            # Public examples remain outside the personal queue, even after every template is loaded.
            assert context.get("http://127.0.0.1:4320/api/jobs").json() == []
            for item in modules:
                capability = item["module"]["capability_id"]
                response = context.post(
                    f"http://127.0.0.1:4320/api/examples/{capability}/prepare",
                    headers={"X-Workbench-CSRF": csrf},
                    data={},
                )
                assert response.ok, response.text()
                prepared = response.json()
                assert prepared["request"] and prepared["request"]["operation"]
                # Open each native task directly through the normal application route.
                identifier = item["pin"]["job_id"]
                page.goto(f"http://127.0.0.1:4320/#task={identifier}")
                page.wait_for_timeout(400)
                page.get_by_text("已完成", exact=True).first.wait_for(timeout=15000)
                page.screenshot(path=str(destination / f"{capability}-results.png"), full_page=True)
                if capability in {"screening.dock", "drugclip.screen", "del.candidates"}:
                    assert page.locator(".dataset-candidate-table").is_visible()
                    page.get_by_text("下载当前结构", exact=True).first.wait_for(timeout=20000)
                if capability == "del.analyze":
                    assert page.locator(".dataset-table-scroll tbody tr").count() == 20
                    page.get_by_text("图表与质量", exact=True).click()
                    page.locator(".dataset-chart svg").first.wait_for()
                    page.screenshot(
                        path=str(destination / "del-analysis-quality.png"), full_page=True
                    )
                # Screenshots and checks inspect only changed research pages.
                assert not page.get_by_text("native-exit.json", exact=False).count()
            assert not failures, failures
            assert context.get("http://127.0.0.1:4320/api/jobs").json() == []
            browser.close()
    finally:
        server.should_exit = True
        thread.join(timeout=15)
