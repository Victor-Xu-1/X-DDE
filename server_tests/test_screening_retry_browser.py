"""Real screening form retry interaction against a non-executing transport fixture."""

import hashlib
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import pytest
from browser_platform import platform
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from opendde_workbench.workflows.contracts import PlanInput


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("lost_stage", ["plan", "run"])
def test_screening_recovers_one_accepted_intent_after_a_lost_response(language, lost_stage):
    """Archived source bytes are real; readiness and acceptance are explicit test fixtures."""
    zh = language == "zh"
    evidence = Path("outputs/publication-browser/screening-retry")
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / f"{language}-{lost_stage}.log") as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        calls, plans, runs, errors, forbidden = [], {}, {}, [], []
        losses = 0
        page.on("pageerror", lambda error: errors.append(str(error)))

        def guard_science(route):
            if route.request.method == "POST":
                forbidden.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/jobs", guard_science)
        page.route("**/api/batches", guard_science)

        def archived_example(route):
            # Explicit archive selection preserves the reviewed original sources.
            response = route.fetch(url=route.request.url + "?profile=archive")
            route.fulfill(response=response)

        page.route("**/api/examples/drugclip.screen", archived_example)
        page.route("**/api/examples/drugclip.screen/prepare", archived_example)
        for capability in ("drugclip.screen", "screening.dock", "library.import"):
            page.route(
                f"**/api/capabilities/{capability}",
                lambda route: route.fulfill(json={"availability": {"configuration_present": True}}),
            )

        def workflow(route):
            nonlocal losses
            request = route.request
            path = request.url.removeprefix(base + "/api")
            if request.method == "GET" and path.startswith("/workflows/runs/"):
                run = next(value for value in runs.values() if path.endswith(value["id"]))
                route.fulfill(json=run)
                return
            assert request.method == "POST"
            key = request.headers["idempotency-key"]
            body = request.post_data_json
            calls.append({"path": path, "key": key, "body": body})
            stage = "plan" if path == "/workflows/plans" else "run"
            if stage == "plan":
                # Exercise the unchanged backend binding contract without starting a worker.
                validated = PlanInput.model_validate(body)
                digest = hashlib.sha256(validated.model_dump_json().encode()).hexdigest()
                value = {
                    "id": str(uuid5(NAMESPACE_URL, "plan:" + key)),
                    "sha256": digest,
                    "body": body,
                    "created_at": "2026-10-12T00:00:00Z",
                }
                if key in plans:
                    assert plans[key] == value
                plans[key] = value
            else:
                plan = next(value for value in plans.values() if f"/{value['id']}/" in path)
                assert body == {"plan_sha256": plan["sha256"]}
                value = {
                    "id": str(uuid5(NAMESPACE_URL, "run:" + key)),
                    "plan_id": plan["id"],
                    "state": "running",
                    "reason": None,
                    "created_at": "2026-10-12T00:00:00Z",
                    "attempts": [],
                }
                if key in runs:
                    assert runs[key] == value
                runs[key] = value
            if stage == lost_stage and losses == 0:
                losses += 1
                route.abort("failed")
            else:
                route.fulfill(json=value)

        page.route("**/api/workflows/**", workflow)
        page.goto(base)
        jobs_before = page.request.get(base + "/api/jobs").json()
        card = page.locator('button[data-capability="drugclip.screen"]').first
        expect(card).to_have_count(1, timeout=30000)
        if not card.is_visible():
            card.locator("xpath=ancestor::details").locator("summary").click()
        card.click()
        page.get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
        form = page.locator(".dataset-screening-form .questionnaire")
        expect(form).to_be_visible(timeout=30000)
        for _ in range(3):
            next_step = form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
            expect(next_step).to_be_enabled(timeout=30000)
            next_step.click()
        form.get_by_role(
            "radio", name="筛选＋重点对接" if zh else "Screen and dock", exact=False
        ).check()
        submit = form.get_by_role(
            "button", name="提交筛选" if zh else "Submit screening", exact=True
        )
        expect(submit).to_be_enabled(timeout=30000)
        submit.click()
        expect(form.get_by_role("alert")).to_be_visible(timeout=15000)
        expect(submit).to_be_enabled()
        page.screenshot(path=str(evidence / f"{language}-{lost_stage}-uncertain.png"))
        form.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        submit.click()
        expect(
            form.get_by_role("region", name="研究计划运行" if zh else "Research plan run")
        ).to_be_visible()
        expect(
            form.get_by_role("button", name="步骤 5: 查看结果" if zh else "Step 5: View results")
        ).to_have_attribute("aria-current", "step")
        assert len(plans) == len(runs) == 1
        plan_calls = [call for call in calls if call["path"] == "/workflows/plans"]
        run_calls = [call for call in calls if call["path"].endswith("/runs")]
        assert plan_calls[0] == plan_calls[1]
        assert len(run_calls) == (2 if lost_stage == "run" else 1)
        if lost_stage == "run":
            assert run_calls[0] == run_calls[1]
        assert not forbidden and not errors
        assert page.request.get(base + "/api/jobs").json() == jobs_before
        page.screenshot(path=str(evidence / f"{language}-{lost_stage}-recovered.png"))
        (evidence / f"{language}-{lost_stage}-calls.json").write_text(json.dumps(calls, indent=2))
        browser.close()
