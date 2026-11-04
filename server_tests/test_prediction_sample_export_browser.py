"""Replay the sealed three-conformer STAT6 study and open actual ZIP downloads."""

import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_native_stat6_sample_bar_selects_best_and_packages_exact_native_bytes(
    restored_workspace, language, width
):
    settings, store, pins = restored_workspace
    pin = pins.get("boltz.predict", verify=True)
    assert pin
    job = str(pin.job_id)
    assert job == "1190e938-51af-44a3-9dbc-4aacc77b5821"
    before = [row.model_dump(mode="json") for row in store.list_jobs(1000)]
    evidence = Path("outputs/prediction-sample-package") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#task=" + job)
        bar = page.get_by_role("region", name="构象与置信度" if zh else "Sample and confidence")
        select = bar.get_by_role(
            "button", name="构象 structure-003" if zh else "Sample structure-003"
        )
        select.click()
        expect(select).to_have_attribute("aria-pressed", "true")
        expect(bar).to_contain_text("0.80")
        expect(
            page.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓")
        ).to_be_enabled(timeout=30000)
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / "selected-sample.png")

        def download(candidate, index):
            with page.expect_download() as received:
                bar.get_by_role("button", name="下载此构象 ↓" if zh else "This model ↓").click()
            path = evidence / f"{candidate}.zip"
            received.value.save_as(path)
            with zipfile.ZipFile(path) as archive:
                receipt = json.loads(archive.read("sample.json"))
                assert receipt["candidate"] == candidate and receipt["source_job"] == job
                assert set(receipt["files"]) == {"structure", "confidence_summary"}
                for role, item in receipt["files"].items():
                    expected = (
                        candidate + ".cif"
                        if role == "structure"
                        else (
                            "native/boltz_results_prediction/predictions/prediction/"
                            f"confidence_prediction_model_{index}.json"
                        )
                    )
                    assert item["source_artifact"] == expected
                    digest = hashlib.sha256(archive.read(item["member"])).hexdigest()
                    assert digest == item["sha256"] == pin.artifact_sha256[expected]

        download("structure-003", 2)
        bar.get_by_role(
            "button", name="最高排序分 · structure-001" if zh else "Highest ranking · structure-001"
        ).click()
        expect(
            bar.get_by_role("button", name="构象 structure-001" if zh else "Sample structure-001")
        ).to_have_attribute("aria-pressed", "true")
        expect(bar).to_contain_text("0.87")
        selected = bar.locator('.prediction-sample-options [aria-pressed="true"]').bounding_box()
        sample_list = bar.locator(".prediction-sample-options").bounding_box()
        assert selected and sample_list
        assert selected["x"] >= sample_list["x"] - 1
        assert selected["x"] + selected["width"] <= sample_list["x"] + sample_list["width"] + 1
        download("structure-001", 0)
        missing = page.request.get(base + f"/api/jobs/{job}/prediction-sample.zip?candidate=absent")
        assert missing.status == 404

        open_dde = pins.get("predict", verify=True)
        assert open_dde and str(open_dde.job_id) == "716024e7-0a4a-4b9f-8962-fae4257bba48"
        response = page.request.get(
            base + f"/api/jobs/{open_dde.job_id}/prediction-sample.zip?candidate=seed-101-sample-0"
        )
        assert response.ok
        with zipfile.ZipFile(io.BytesIO(response.body())) as archive:
            receipt = json.loads(archive.read("sample.json"))
            assert receipt["source_job"] == str(open_dde.job_id)
            assert receipt["candidate"] == "seed-101-sample-0"
            prefix = f"{open_dde.job_id}/seed_101/predictions/{open_dde.job_id}"
            assert receipt["files"]["structure"]["source_artifact"] == prefix + "_sample_0.cif"
            assert receipt["files"]["confidence_summary"]["source_artifact"] == (
                prefix + "_summary_confidence_sample_0.json"
            )
            assert set(receipt["files"]) == {"structure", "confidence_summary"}
            for entry in receipt["files"].values():
                digest = hashlib.sha256(archive.read(entry["member"])).hexdigest()
                assert (
                    digest == entry["sha256"] == open_dde.artifact_sha256[entry["source_artifact"]]
                )
        assert not writes
        assert [row.model_dump(mode="json") for row in store.list_jobs(1000)] == before
        browser.close()
