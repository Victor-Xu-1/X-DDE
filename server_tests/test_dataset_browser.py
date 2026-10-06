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
            # Loading a public template must not enqueue its historical computations.
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
                page.locator(".dataset-results .dataset-status-complete").wait_for(timeout=15000)
                if capability in {
                    "library.import",
                    "library.select",
                    "screening.dock",
                    "drugclip.screen",
                    "del.analyze",
                    "del.candidates",
                    "del.enumerate",
                }:
                    page.locator(".dataset-results .molecule-image img").first.wait_for(
                        timeout=30000
                    )
                page.screenshot(path=str(destination / f"{capability}-results.png"), full_page=True)
                if capability in {"screening.dock", "drugclip.screen", "del.candidates"}:
                    assert page.locator(".dataset-candidate-table").is_visible()
                    page.get_by_text("下载当前结构", exact=True).first.wait_for(timeout=20000)
                if capability == "del.analyze":
                    from playwright.sync_api import expect

                    expect(
                        page.locator(".dataset-table-region .dataset-table-scroll tbody tr")
                    ).to_have_count(20)
                    page.get_by_text("图表与质量", exact=True).click()
                    page.locator(".dataset-chart svg").first.wait_for()
                    page.screenshot(
                        path=str(destination / "del-analysis-quality.png"), full_page=True
                    )
                # Screenshots and checks inspect only changed research pages.
                assert not page.get_by_text("native-exit.json", exact=False).count()
            assert not failures, failures
            assert context.get("http://127.0.0.1:4320/api/jobs").json() == []
            for item in modules:
                capability = item["module"]["capability_id"]
                page.goto("http://127.0.0.1:4320/", wait_until="networkidle")
                card = page.locator(f'button[data-capability="{capability}"]')
                card.wait_for(state="attached")
                if not card.is_visible():
                    card.locator("xpath=ancestor::details[1]").locator("summary").click()
                card.click()
                page.get_by_role("button", name="使用此模板", exact=True).click()
                form = page.locator(".dataset-workspace .questionnaire")
                form.wait_for()
                for step in range(4):
                    assert form.locator("fieldset:visible").count() == 1
                    page.screenshot(
                        path=str(destination / f"{capability}-step{step + 1}.png"), full_page=True
                    )
                    if step < 3:
                        from playwright.sync_api import expect

                        next_button = form.get_by_role("button", name="下一步", exact=True)
                        expect(next_button).to_be_enabled(timeout=15000)
                        next_button.click()
                        expect(
                            form.locator(".questionnaire-steps button").nth(step + 1)
                        ).to_have_attribute("aria-current", "step")
                form.get_by_role("button", name="上一步", exact=True).click()
                form.get_by_role("button", name="下一步", exact=True).click()
                page.get_by_role("button", name="示例结果", exact=True).click()
                page.locator(".module-example-result .dataset-results").wait_for()
                if capability in {
                    "library.import",
                    "library.select",
                    "screening.dock",
                    "drugclip.screen",
                    "del.analyze",
                    "del.candidates",
                    "del.enumerate",
                }:
                    page.locator(".module-example-result .molecule-image img").first.wait_for(
                        timeout=30000
                    )
                page.screenshot(
                    path=str(destination / f"{capability}-in-module.png"), full_page=True
                )
            assert not failures, failures
            browser.close()
    finally:
        server.should_exit = True
        thread.join(timeout=15)
