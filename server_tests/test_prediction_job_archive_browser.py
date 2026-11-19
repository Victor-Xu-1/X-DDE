"""Download task-wide scientific data from two retained STAT6 prediction paths."""

import hashlib
import json
import zipfile
from pathlib import Path
from urllib.parse import parse_qs

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace


@pytest.mark.parametrize(
    ("language", "width", "theme"),
    [("en", 1440, "light"), ("zh", 390, "light"), ("en", 1440, "dark")],
)
def test_prediction_zip_preserves_all_original_files(restored_workspace, language, width, theme):
    settings, store, pins = restored_workspace
    before = [row.model_dump(mode="json") for row in store.list_jobs(1000)]
    evidence = Path("outputs/prediction-job-archive") / (
        language if theme == "light" else "en-dark"
    )
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.add_init_script(f"localStorage.setItem('x-dde-theme','{theme}')")
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
            job = store.get(job_id)
            assert job is not None
            scoped = capability == "boltz.predict"
            task_hash = (
                "#view=results&module=structures&status=succeeded&task=" if scoped else "#task="
            )
            # Titles deliberately stay neutral until the retained origin is verified.
            # Wait for that authoritative response, not a shorter generic UI timeout.
            with page.expect_response(
                lambda response, expected=job_id: response.request.method == "GET"
                and response.url.endswith(f"/api/task-history/{expected}/identity"),
                timeout=15000,
            ) as source_response:
                page.goto(base + "/" + task_hash + job_id)
            response = source_response.value
            assert response.ok
            identity = response.json()
            assert identity["job_id"] == job_id and identity["origin"] == "fixed_example"
            assert any(
                "STAT6" in text for case in identity["example_cases"] for text in case["label"]
            )
            (evidence / f"{capability}-identity.json").write_text(json.dumps(identity))
            heading = page.locator(".prediction-result-heading")
            expect(heading.get_by_role("heading")).to_contain_text("STAT6")
            expect(heading.locator("time")).to_have_attribute("datetime", job.created_at)
            expect(heading.locator(".prediction-result-method")).to_have_text(
                ("预测模型" if zh else "Prediction model") + (" Boltz-2" if scoped else " OpenDDE")
            )
            expect(
                heading.get_by_role("button", name="查看输入" if zh else "View input")
            ).to_be_visible()
            action = heading.get_by_role(
                "button", name="下载全部数据" if zh else "Download all data", exact=True
            )
            expect(action).to_be_visible()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            expect(action).to_have_css("background-color", "rgb(47, 103, 178)")
            expect(action).to_have_css("color", "rgb(255, 255, 255)")
            page.screenshot(path=evidence / f"{capability}.png")
            if width == 390 and capability == "predict":
                expand = page.get_by_role("button", name="展开研究工作区")
                expand.click()
                workspace = page.locator('.structure-workbench[data-workspace-expanded="true"]')
                metrics = workspace.locator(".prediction-confidence-metrics > div")
                page.set_viewport_size({"width": 320, "height": 960})
                expect(metrics).to_have_count(4)
                assert metrics.evaluate_all(
                    "cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1)"
                )
                matrix = workspace.locator(".prediction-confidence-body")
                expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
                page.wait_for_function("""() => {
                    const panel = document.querySelector('[data-workspace-expanded="true"]');
                    const chart = panel?.querySelector(
                        '.prediction-confidence-body [role="application"]'
                    );
                    const svg = chart?.querySelector('.svg-container');
                    return svg && svg.getBoundingClientRect().width <= chart.clientWidth + 1
                        && panel.scrollWidth <= panel.clientWidth + 1;
                }""")
                page.screenshot(path=evidence / "expanded-metrics-320.png")
                page.keyboard.press("Escape")
                expect(workspace).to_have_count(0)
                expect(expand).to_be_focused()
                page.set_viewport_size({"width": width, "height": 960})
            if capability == "boltz.predict":
                endpoint = f"**/api/jobs/{job_id}/prediction-results.zip"
                page.route(endpoint, lambda route: route.fulfill(status=503), times=1)
                action.press("Enter")
                expect(
                    page.locator(".prediction-archive-download").get_by_role("alert")
                ).to_be_visible()
                action.focus()
                expect(action).to_be_focused()
                expect(action).to_have_css("background-color", "rgb(47, 103, 178)")
                expect(action).to_have_css("color", "rgb(255, 255, 255)")
                page.screenshot(path=evidence / "retry.png")
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
            assert not heading.locator(".prediction-archive-download [role=alert]").count()
            heading.get_by_role("button", name="预测记录" if zh else "Predictions").press("Enter")
            expect(page.locator(".task-history-title h2")).to_be_focused()
            expect(page.locator(".task-history-list")).to_be_visible()
            expect(heading).to_have_count(0)
            params = parse_qs(page.url.split("#", 1)[1])
            assert params["view"] == ["results"]
            assert params["module"] == ["structures"]
            assert "task" not in params
            assert params.get("status") == (["succeeded"] if scoped else None)
        assert not writes
        assert [row.model_dump(mode="json") for row in store.list_jobs(1000)] == before
        browser.close()
