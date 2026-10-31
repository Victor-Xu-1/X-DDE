"""Retained native docking handoff, large metadata history and lost replies; no inference."""

import hashlib
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.docking.result import DockingResult
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.models import Status
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.result_download_probe import selected_pose_download


def native_source(settings, store, original, name):
    job = store.create(
        original.request.model_copy(update={"name": name, "project_id": None}),
        str(uuid4()),
        1000,
        2000,
        parent_id=original.id,
    )
    assert store.claim(expected_id=job.id)
    target = settings.state_dir / "jobs" / job.id
    shutil.copytree(settings.state_dir / "jobs" / original.id, target)
    store.finish(job.id, Status.SUCCEEDED)
    return store.get(job.id), target / "output"


def scaling_metadata(scientific, job):
    """Metadata-only version rows exercise the old 1000-row ceiling, not new results."""
    asset = scientific.assets.save(
        "STAT6-metadata-history-source.sdf", "ligand", verified_input("study_ligand")
    )
    prototype = scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Metadata-only history fixture"),
        uuid4(),
        source_job=job.id,
    )
    with scientific.store.connect() as db:
        db.executemany(
            "INSERT INTO scientific_objects VALUES(?,?,?,?,?,?)",
            [
                (
                    str(identifier),
                    str(prototype.family_id),
                    asset.id,
                    prototype.model_copy(
                        update={
                            "id": identifier,
                            "reference": prototype.reference.model_copy(
                                update={"version_id": identifier}
                            ),
                            "label": f"Metadata-only history fixture {index}",
                        }
                    ).model_dump_json(),
                    "metadata-only-fixture",
                    "2099-01-01",
                )
                for index in range(1100)
                for identifier in [uuid4()]
            ],
        )


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_pose_handoff_keeps_selected_identity_and_recovers_committed_registration(
    language, width
):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("gnina.dock", verify=True)
    assert pin, "Reviewed native archived docking inputs are required"
    original = store.get(str(pin.job_id))
    source, root = native_source(
        settings, store, original, f"Retained archived docking handoff · {language}"
    )
    lost, lost_root = native_source(
        settings, store, original, f"Retained archived docking recovery · {language}"
    )
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    scaling_metadata(scientific, source)
    scaling_metadata(scientific, lost)
    native = DockingResult.model_validate_json((root / "result.json").read_text())
    poses = [pose for pose in native.poses if pose.valid and pose.artifact]
    assert len(poses) >= 2, "Actual multi-pose native output is required for selection acceptance"
    before_jobs = {job.id for job in store.list_jobs(1000)}
    before_bytes = {pose.artifact: (root / pose.artifact).read_bytes() for pose in poses}
    evidence = Path("outputs/result-handoff") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions, lookups, held = [], [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.on(
            "request",
            lambda request: (
                lookups.append(request.url) if "/api/research/objects?" in request.url else None
            ),
        )

        def hold_registration(route):
            response = route.fetch()
            assert response.ok
            held.append((route, response))

        page.route(f"**/api/jobs/{source.id}/index-assets", hold_registration)
        page.goto(base + "/#task=" + source.id)
        result = page.locator(".docking-results")
        prepare = result.get_by_role(
            "button", name="登记并读取这个姿势" if zh else "Register and load this pose", exact=True
        )
        expect(prepare).to_be_enabled()
        prepare.click()
        for _ in range(100):
            if held:
                break
            page.wait_for_timeout(100)
        assert held, "Registration must actually commit before switching"
        second = poses[1]
        result.get_by_role(
            "button", name=("姿势 " if zh else "Pose ") + str(second.record + 1), exact=True
        ).click()
        follow = result.get_by_role(
            "button", name="计算性质" if zh else "Calculate properties", exact=True
        )
        expect(follow).to_be_visible()
        held[0][0].fulfill(response=held[0][1])
        download = result.get_by_role(
            "link", name="下载所选姿势 SDF" if zh else "Download selected pose SDF", exact=True
        )
        expect(download).to_have_attribute(
            "href", f"/api/jobs/{source.id}/download?name={second.artifact}"
        )
        expected = scientific.list(
            1,
            source_job=source.id,
            asset_name=second.artifact,
            sha256=hashlib.sha256(before_bytes[second.artifact]).hexdigest(),
            kind="molecule",
            record=0,
        )[0]
        assert expected not in scientific.list(200, source_job=source.id)
        try:
            downloaded = selected_pose_download(page, download, evidence)
        except Exception:
            page.screenshot(path=str(evidence / "download-failure.png"))
            (evidence / "download-failure.txt").write_text(page.locator("main").inner_text())
            raise
        saved = Path(downloaded.path())
        assert saved.read_bytes() == before_bytes[second.artifact]
        page.screenshot(path=str(evidence / "large-history-selected-pose.png"))
        follow.click()
        expect(page.locator(".questionnaire:visible")).to_be_visible()
        page.get_by_role(
            "button", name="← 返回结果" if zh else "← Back to results", exact=True
        ).click()
        expect(download).to_have_attribute(
            "href", f"/api/jobs/{source.id}/download?name={second.artifact}"
        )

        committed = []

        def lose_reply(route):
            response = route.fetch()
            assert response.ok
            committed.append(response.json())
            route.abort("failed")

        page.route(f"**/api/jobs/{lost.id}/index-assets", lose_reply)
        page.goto(base + "/#task=" + lost.id)
        expect(prepare).to_be_enabled()
        prepare.click()
        alert = result.get_by_role("alert")
        expect(alert).to_contain_text("请重试" if zh else "Please retry")
        with store.connect() as db:
            registered = set(
                row[0]
                for row in db.execute(
                    "SELECT id FROM scientific_objects WHERE json_extract(body,'$.source_job')=?",
                    (lost.id,),
                )
            )
        alert.get_by_role(
            "button", name="重新读取保存的材料" if zh else "Retry saved materials", exact=True
        ).click()
        expect(follow).to_be_visible()
        page.screenshot(path=str(evidence / "committed-version-recovered.png"))
        with store.connect() as db:
            assert registered == set(
                row[0]
                for row in db.execute(
                    "SELECT id FROM scientific_objects WHERE json_extract(body,'$.source_job')=?",
                    (lost.id,),
                )
            )
        assert len(committed) == 1 and not submissions and not errors
        assert all("limit=1" in url and "sha256=" in url and "record=" in url for url in lookups)
        browser.close()
    assert {job.id for job in store.list_jobs(1000)} == before_jobs
    assert all((root / name).read_bytes() == content for name, content in before_bytes.items())
    assert all((lost_root / name).read_bytes() == content for name, content in before_bytes.items())
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "language": language,
                "width": width,
                "saved_version": str(expected.id),
                "record": expected.reference.record,
                "sha256": expected.reference.sha256,
                "large_history_exact_lookup": True,
                "newer_selection_retained": True,
                "committed_version_recovered": True,
                "scientific_jobs_submitted": 0,
            },
            indent=2,
        )
    )
