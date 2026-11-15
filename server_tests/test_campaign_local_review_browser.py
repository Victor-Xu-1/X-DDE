"""Actual bilingual form interactions with controlled plan responses; no models."""

import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

CONFIG = json.loads(Path("tests/fixtures/campaign_review/input.json").read_text())


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_local_review_does_not_grant_or_dispatch_external_work(tmp_path, language, width):
    assert tmp_path.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = Path("outputs/campaign-review") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    calls, jobs, errors = [], [], []
    plan = {
        "id": "controlled-plan",
        "digest": "a" * 64,
        "state": "validated",
        "task_id": None,
        "summary": {"target": CONFIG["target"]["name"]},
    }

    def plan_response(route):
        if route.request.method != "POST":
            route.continue_()
            return
        assert route.request.post_data_json == {"config": CONFIG}
        calls.append("validate")
        route.fulfill(status=200, content_type="application/json", body=json.dumps(plan))

    def launch_response(route):
        assert route.request.method == "POST"
        assert route.request.post_data_json == {"digest": plan["digest"]}
        calls.append("start")
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({**plan, "state": "running", "task_id": "controlled-dispatch"}),
        )

    with (
        platform(tmp_path / "state", evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                jobs.append(request.url)
                if request.method == "POST" and request.url.split("?")[0].endswith("/api/jobs")
                else None
            ),
        )
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.route("**/api/harness/plans", plan_response)
        page.route("**/api/harness/plans/controlled-plan/start", launch_response)
        page.goto(base + "/#view=new&tool=campaign")
        before = page.request.get(base + "/api/jobs").json()
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        page.get_by_role(
            "button", name="专家参数" if zh else "Expert parameters", exact=True
        ).click()
        next_step.click()
        page.get_by_role(
            "textbox", name="完整设计配置" if zh else "Full design configuration", exact=True
        ).fill(json.dumps(CONFIG))
        next_step.click()
        permission = page.get_by_role(
            "checkbox", name=re.compile("允许本设计任务调用" if zh else "Allow this campaign")
        )
        expect(permission).not_to_be_checked()
        expect(next_step).to_be_enabled()
        next_step.click()
        start = page.get_by_role("button", name="启动设计" if zh else "Start design", exact=True)
        expect(start).to_be_disabled()
        page.get_by_role(
            "button",
            name="检查配置并生成任务摘要" if zh else "Validate and review campaign",
            exact=True,
        ).click()
        review = page.get_by_role(
            "checkbox", name=re.compile("已确认目标" if zh else "I have reviewed the target")
        )
        review.check()
        expect(start).to_be_disabled()
        assert calls == ["validate"]
        page.screenshot(path=evidence / "local-review.png")
        for enabled in (True, False, True):
            page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
            permission.set_checked(enabled)
            next_step.click()
            expect(start).to_be_enabled() if enabled else expect(start).to_be_disabled()
            assert calls == ["validate"]
        start.click()
        expect(
            page.get_by_role("heading", name="5. 跟踪设计" if zh else "5. Track design", exact=True)
        ).to_be_visible()
        assert calls == ["validate", "start"]
        assert page.request.get(base + "/api/jobs").json() == before
        assert not jobs and not errors
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "calls": calls,
                    "controlled_api_responses": True,
                    "model_execution": False,
                    "new_worker_jobs": 0,
                    "permission_revocation_blocks_start": True,
                    "validation_does_not_grant_permission_or_dispatch": True,
                },
                indent=2,
            )
        )
        browser.close()
