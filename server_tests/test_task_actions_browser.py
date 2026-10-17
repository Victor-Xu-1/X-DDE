"""Real task persistence, lost responses, navigation failure and cancellation/retry."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6.catalogue import MANIFEST
from server_tests.test_stat6_templates_browser import catalog

EVIDENCE = Path("server_tests/evidence/task-actions")


def wait_status(page, base, job_id, status):
    for _ in range(80):
        value = page.request.get(base + "/api/jobs/" + job_id).json()
        if value["status"] == status:
            return value
        page.wait_for_timeout(100)
    raise AssertionError(f"Task {job_id} did not reach {status}: {value['status']}")


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("fault", ["response", "navigation"])
def test_confirmed_task_survives_response_or_navigation_failure(language, fault):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    root = EVIDENCE / (language + "-" + fault)
    root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        if fault == "navigation":
            page.add_init_script("""const replace=history.replaceState.bind(history);
              history.replaceState=(...args)=>{
                if(!sessionStorage.getItem('lifecycle-view-fault') &&
                   /#task=[0-9a-f-]{36}/.test(String(args[2]))) {
                  sessionStorage.setItem('lifecycle-view-fault','used');
                  throw new DOMException('Controlled history failure','SecurityError');
                }
                return replace(...args);
              };""")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        catalog(page, language)
        page.locator('button[data-capability="properties"]').click()
        page.get_by_role(
            "radio",
            name="粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)",
            exact=True,
        ).check()
        form = page.locator(".questionnaire:visible")
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        smiles = MANIFEST["molecules"][0]["original_smiles"]
        form.get_by_role("textbox", name="SMILES", exact=True).fill(smiles)
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        name = "STAT6 lifecycle control · " + language + " · " + fault
        form.get_by_role("textbox", name="任务名称（可选）" if zh else "Task name (optional)").fill(
            name
        )
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        submit = form.get_by_role(
            "button", name="计算性质" if zh else "Calculate properties", exact=True
        )
        expect(submit).to_be_enabled(timeout=30000)
        created, keys = [], []

        def create(route):
            if route.request.method != "POST":
                route.continue_()
                return
            keys.append(route.request.headers["idempotency-key"])
            response = route.fetch()
            assert response.ok, response.text()
            created.append(response.json())
            if fault == "response" and len(created) == 1:
                route.abort("failed")
            else:
                route.fulfill(response=response)

        page.route("**/api/jobs", create)
        submit.click()
        if fault == "response":
            expect(form.get_by_role("alert")).to_contain_text(
                "未能确认任务是否提交" if zh else "Task submission could not be confirmed"
            )
            submit.click()
            expect(page.locator(".detail-panel")).to_be_visible()
            assert len(created) == 2 and keys[0] == keys[1]
        else:
            expect(form.get_by_role("alert")).to_contain_text(
                "任务已创建" if zh else "Task created"
            )
            link = form.get_by_role(
                "link",
                name="查看任务进度与结果" if zh else "Open task progress and results",
                exact=True,
            )
            expect(link).to_have_attribute("href", "/#task=" + created[0]["id"])
            page.screenshot(path=root / "accepted-task-link.png")
            link.click()
            expect(page.locator(".detail-panel")).to_be_visible()
            assert len(created) == 1
        job_id = created[0]["id"]
        assert all(job["id"] == job_id for job in created)
        assert created[0]["request"]["smiles"] == [smiles]
        assert len(page.request.get(base + "/api/jobs").json()) == len(before) + 1
        page.once("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="取消任务" if zh else "Cancel task", exact=True).click()
        wait_status(page, base, job_id, "cancelled")
        rerun = page.get_by_role("button", name="重新运行" if zh else "Run again", exact=True)
        expect(rerun).to_be_enabled(timeout=15000)
        retried, retry_keys = [], []

        def retry(route):
            retry_keys.append(route.request.headers["idempotency-key"])
            response = route.fetch()
            assert response.ok, response.text()
            retried.append(response.json())
            if len(retried) == 1:
                route.abort("failed")
            else:
                route.fulfill(response=response)

        page.route("**/api/jobs/*/retry", retry)
        rerun.click()
        expect(page.locator(".detail-panel").get_by_role("alert")).to_be_visible()
        rerun.click()
        # Task history now retains its research module while selecting the retry child.
        expect(page).to_have_url(base + "/#view=results&module=evaluation&task=" + retried[0]["id"])
        assert len(retried) == 2 and retry_keys[0] == retry_keys[1]
        assert retried[0]["id"] == retried[1]["id"]
        assert retried[0]["parent_id"] == job_id
        page.once("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="取消任务" if zh else "Cancel task", exact=True).click()
        wait_status(page, base, retried[0]["id"], "cancelled")
        assert len(page.request.get(base + "/api/jobs").json()) == len(before) + 2
        assert not errors, errors
        page.screenshot(path=root / "recovered-task-and-retry.png")
        (root / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "fault": fault,
                    "created_task": job_id,
                    "retry_child": retried[0]["id"],
                    "created_tasks": 2,
                    "both_cancelled": True,
                    "scientific_inference": False,
                    "original_smiles_preserved": True,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("destination", ["other_task", "new_task"])
def test_late_confirmed_retry_does_not_reclaim_navigation(language, destination):
    """Hold an accepted real API response while its keyed task detail unmounts."""
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    root = EVIDENCE / (language + "-late-retry-" + destination)
    root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        token = page.request.get(base + "/api/session").json()["csrf_token"]
        headers = {"Origin": base, "X-Workbench-CSRF": token}
        before = {job["id"] for job in page.request.get(base + "/api/jobs").json()}
        owned, held, observed = [], [], []
        released = False

        def cancel(job_id):
            response = page.request.post(base + "/api/jobs/" + job_id + "/cancel", headers=headers)
            assert response.ok, response.text()
            return wait_status(page, base, job_id, "cancelled")

        def create(name):
            response = page.request.post(
                base + "/api/jobs",
                headers={**headers, "Idempotency-Key": str(uuid4())},
                data={
                    "operation": "properties",
                    "name": name,
                    "smiles": [MANIFEST["molecules"][0]["original_smiles"]],
                },
            )
            assert response.ok, response.text()
            job = response.json()
            owned.append(job["id"])
            cancel(job["id"])
            return job

        try:
            origin = create("Origin study · " + language + " · " + destination)
            target = create("Destination study · " + language + " · " + destination)
            page.goto(base + "/#view=results&module=evaluation&task=" + origin["id"])
            expect(page.locator(".detail-panel h2")).to_have_text(origin["request"]["name"])

            def defer_retry(route):
                response = route.fetch()
                assert response.ok, response.text()
                child = response.json()
                assert child["parent_id"] == origin["id"]
                owned.append(child["id"])
                observed.append(child)
                held.append((route, response))

            page.route("**/api/jobs/" + origin["id"] + "/retry", defer_retry)
            rerun = page.get_by_role("button", name="重新运行" if zh else "Run again", exact=True)
            rerun.click()
            expect(rerun).to_be_disabled()
            for _ in range(100):
                if held:
                    break
                page.wait_for_timeout(50)
            assert len(held) == len(observed) == 1
            if destination == "other_task":
                page.locator(".task-picker summary").click()
                page.get_by_role("button", name=target["request"]["name"], exact=True).click()
                expect(page.locator(".detail-panel h2")).to_have_text(target["request"]["name"])
            else:
                page.get_by_role(
                    "navigation", name="模块工作区" if zh else "Module workspace"
                ).get_by_role(
                    "button",
                    name="新建任务" if zh else "New task",
                    exact=True,
                ).click()
                expect(page.locator(".questionnaire:visible")).to_be_visible()
                expect(page.locator(".detail-panel")).to_have_count(0)
            chosen_url = page.url
            with page.expect_response(
                lambda response: response.url.endswith(origin["id"] + "/retry")
            ):
                held[0][0].fulfill(response=held[0][1])
                released = True
            # A bounded browser turn lets fetch parsing and the old callback settle.
            page.wait_for_timeout(250)
            expect(page).to_have_url(chosen_url)
            if destination == "other_task":
                expect(page.locator(".detail-panel h2")).to_have_text(target["request"]["name"])
            else:
                expect(page.locator(".questionnaire:visible")).to_be_visible()
                expect(page.locator(".detail-panel")).to_have_count(0)
            assert len(observed) == 1
            accepted = page.request.get(base + "/api/jobs/" + observed[0]["id"]).json()
            assert accepted["status"] in {"queued", "running"}, (
                "Navigation must not cancel accepted work"
            )
            after = {job["id"] for job in page.request.get(base + "/api/jobs").json()}
            assert after - before == set(owned)
            assert not errors, errors
            page.screenshot(path=root / "late-retry-keeps-destination.png")
        finally:
            if held and not released:
                held[0][0].fulfill(response=held[0][1])
            for job_id in owned:
                cancel(job_id)
            browser.close()
        (root / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "destination": destination,
                    "origin": origin["id"],
                    "target": target["id"],
                    "retry_child": observed[0]["id"],
                    "retry_requests": len(observed),
                    "navigation_preserved": True,
                    "accepted_child_not_cancelled_by_navigation": True,
                    "all_owned_tasks_cancelled_after_check": True,
                    "scientific_inference": False,
                    "errors": errors,
                },
                indent=2,
            )
        )
