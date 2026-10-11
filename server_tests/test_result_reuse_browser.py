"""Retained native docking handoff and controlled history metadata; no new inference."""

import hashlib
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.docking.result import DockingResult
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_old_native_result_becomes_exact_input_once_and_no_other_job_is_created(language, width):
    zh = language == "zh"
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("gnina.dock", verify=True)
    assert pin is not None, "The reviewed native docking case is required"
    original = store.get(str(pin.job_id))
    source = store.create(
        original.request.model_copy(
            update={"name": "Native docking handoff · retained archived output", "project_id": None}
        ),
        str(uuid4()),
        1000,
        2000,
        parent_id=original.id,
    )
    assert store.claim(expected_id=source.id) is not None
    source_root = settings.state_dir / "jobs" / original.id
    target = settings.state_dir / "jobs" / source.id
    shutil.copytree(source_root, target)
    store.finish(source.id, Status.SUCCEEDED)
    native = DockingResult.model_validate_json((target / "output" / "result.json").read_text())
    assert any(pose.valid for pose in native.poses), "The reviewed case needs a qualified pose"
    selected_name = native.pose_artifact
    assert selected_name in pin.artifact_sha256
    selected_bytes = (target / "output" / selected_name).read_bytes()
    selected_sha = hashlib.sha256(selected_bytes).hexdigest()
    assert selected_sha == pin.artifact_sha256[selected_name]
    # These rows exercise the old hundred-row window, and are never scientific results.
    for i in range(125):
        job = store.create(
            Properties(
                name=f"Controlled completed-source metadata {language} {i:03d}", smiles=["c1ccccc1"]
            ),
            str(uuid4()),
            1000,
            2000,
        )
        assert store.claim(expected_id=job.id) is not None
        store.finish(job.id, Status.SUCCEEDED)
    before = {job.id for job in store.list_jobs(1000)}
    evidence = Path("outputs/reference-input/result-reuse") / language
    evidence.mkdir(parents=True, exist_ok=True)
    warhead = next(key for key, info in FILES.items() if info.name == "STAT6-user-warhead.sdf")
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="性质与安全性" if zh else "Properties and safety", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("properties")
        form = page.locator(".questionnaire:visible")
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        picker = form.locator(".asset-picker")
        picker.locator("input[type=file]").set_input_files(
            {
                "name": "STAT6-original-input.sdf",
                "mimeType": "chemical/x-mdl-sdfile",
                "buffer": verified_input(warhead),
            }
        )
        expect(
            form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_enabled()
        picker.locator("summary").click()
        picker.get_by_role(
            "button", name="从已有任务结果中选择" if zh else "Choose from task results", exact=True
        ).click()
        result = picker.get_by_role(
            "region", name="选择任务结果" if zh else "Choose a task result", exact=True
        )
        pages = result.get_by_role(
            "navigation", name="结果来源分页" if zh else "Result source pages", exact=True
        )
        task = result.get_by_role("combobox", name="来源任务" if zh else "Source task", exact=True)
        for i in range(6):
            pages.get_by_role("button", name="下一页" if zh else "Next page", exact=True).click()
            expect(pages).to_contain_text(str((i + 1) * 20 + 1))
        task.select_option(source.id)
        expect(
            form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_disabled()
        files = result.get_by_role("combobox", name="结果文件" if zh else "Result file", exact=True)
        files.select_option(selected_name)
        page.screenshot(path=evidence / "older-native-source.png")
        url = base + f"/api/jobs/{source.id}/assets"
        keys = []

        def lost_reply(route):
            keys.append(route.request.headers.get("idempotency-key"))
            response = route.fetch()
            assert response.ok
            route.fulfill(
                status=503, json={"detail": "Controlled lost registration reply /private/runtime"}
            )

        page.route(url + "?*", lost_reply)
        result.get_by_role(
            "button", name="使用这个结果" if zh else "Use this result", exact=True
        ).click()
        expect(
            form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_disabled()
        expect(result.get_by_role("alert")).to_contain_text("同一个请求" if zh else "same request")
        expect(result).not_to_contain_text("/private")
        saved = page.request.get(base + "/api/assets").json()
        with store.connect() as db:
            objects = db.execute("SELECT COUNT(*) FROM scientific_objects").fetchone()[0]
        page.unroute(url + "?*", lost_reply)
        page.route(
            url + "?*",
            lambda route: (
                keys.append(route.request.headers.get("idempotency-key")),
                route.continue_(),
            ),
        )
        result.get_by_role(
            "button", name="使用这个结果" if zh else "Use this result", exact=True
        ).click()
        expect(result).to_have_count(0)
        expect(
            form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_enabled()
        expect(picker.get_by_text(Path(selected_name).name, exact=True)).to_be_visible()
        assert page.request.get(base + "/api/assets").json() == saved
        with store.connect() as db:
            assert db.execute("SELECT COUNT(*) FROM scientific_objects").fetchone()[0] == objects
        assert len(keys) == 2 and keys[0] and keys[0] == keys[1]
        assert (
            hashlib.sha256(
                page.request.get(
                    base + f"/api/jobs/{source.id}/download", params={"name": selected_name}
                ).body()
            ).hexdigest()
            == selected_sha
        )
        page.screenshot(path=evidence / "confirmed-native-file.png")
        assert {job.id for job in store.list_jobs(1000)} == before
        assert not errors and not submissions
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "native_original_job": original.id,
                    "source_job": source.id,
                    "artifact": selected_name,
                    "sha256": selected_sha,
                    "older_than_hundred": True,
                    "reply_loss_one_registration": True,
                    "originals_unchanged": True,
                    "scientific_inference": False,
                    "submitted_jobs": 0,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
