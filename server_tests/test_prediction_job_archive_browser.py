"""Download task-wide scientific data from two retained STAT6 prediction paths."""

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_prediction_zip_preserves_all_original_files(restored_workspace, language, width):
    settings, store, pins = restored_workspace
    before = [row.model_dump(mode="json") for row in store.list_jobs(1000)]
    evidence = Path("outputs/prediction-job-archive") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []
        page.on(
            "request",
            lambda req: (
                writes.append(req.url)
                if req.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in req.url
                else None
            ),
        )
        for capability in ("boltz.predict", "predict"):
            pin = pins.get(capability, verify=True)
            assert pin
            job_id = str(pin.job_id)
            page.goto(base + "/#task=" + job_id)
            action = page.get_by_role(
                "button", name="下载全部数据" if zh else "Download all data", exact=True
            )
            expect(action).to_be_visible()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            if capability == "boltz.predict":
                endpoint = f"**/api/jobs/{job_id}/prediction-results.zip"
                page.route(endpoint, lambda route: route.fulfill(status=503), times=1)
                action.click()
                expect(
                    page.locator(".prediction-archive-download").get_by_role("alert")
                ).to_be_visible()
            page.screenshot(path=evidence / f"{capability}.png")
            with page.expect_download(timeout=45000) as received:
                action.click()
            assert received.value.suggested_filename == f"{job_id}-prediction-results.zip"
            with zipfile.ZipFile(received.value.path()) as archive:
                receipt = json.loads(archive.read("prediction.json"))
                assert receipt["source_job"] == job_id
                assert receipt["request_sha256"] == pin.request_sha256
                files = receipt["files"]
                assert set(archive.namelist()) == {"prediction.json", *files}
                for name, item in files.items():
                    source = name.removeprefix("outputs/")
                    assert source != "runtime.json"
                    digest = hashlib.sha256(archive.read(name)).hexdigest()
                    assert digest == item["sha256"]
                    if source in pin.artifact_sha256:
                        assert item["matched_recorded_checksum"]
                        assert digest == pin.artifact_sha256[source]
                roles = [item["role"] for item in files.values()]
                if capability == "boltz.predict":
                    for index in (1, 2, 3):
                        assert f"outputs/structure-{index:03d}.cif" in files
                    assert roles.count("confidence_summary") == 3
                    assert "msa" in roles
                else:
                    assert "confidence_full" in roles
                    assert "confidence_summary" in roles
            assert not page.locator(".prediction-archive-download [role=alert]").count()
        assert not writes
        assert [row.model_dump(mode="json") for row in store.list_jobs(1000)] == before
        browser.close()
