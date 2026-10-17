"""Replay a real weak model's output in the browser; no new training or science."""

import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from browser_platform import platform
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings

FIXTURES = Path(__file__).parent / "fixtures"
EVIDENCE = Path("server_tests/evidence/property-model-review")


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_actual_weak_model_display_links_structures_errors_units_and_original_download(
    language, width
):
    job = json.loads((FIXTURES / "stat6-spr-training-job.json").read_bytes())
    result = json.loads((FIXTURES / "stat6-spr-training-result.json").read_bytes())
    original = (FIXTURES / "stat6-spr-held-out-predictions.csv").read_bytes()
    assert len(result["validation_points"]) == 16
    assert (
        hashlib.sha256(original).hexdigest()
        == result["artifact_sha256"]["held-out-predictions.csv"]
    )
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, writes = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        before = page.request.get(base + "/api/jobs").json()
        page.route(re.compile(r"/api/jobs(?:\?|$)"), lambda route: route.fulfill(json=[job]))
        page.route("**/api/jobs/" + job["id"], lambda route: route.fulfill(json=job))
        page.route("**/api/jobs/" + job["id"] + "/result", lambda route: route.fulfill(json=result))
        page.route("**/api/jobs/" + job["id"] + "/artifacts", lambda route: route.fulfill(json=[]))
        page.route(
            "**/api/jobs/" + job["id"] + "/download?name=held-out-predictions.csv",
            lambda route: route.fulfill(
                body=original,
                headers={
                    "Content-Type": "text/csv",
                    "Content-Disposition": 'attachment; filename="held-out-predictions.csv"',
                },
            ),
        )
        page.goto(base + "/#view=results&module=evaluation&task=" + job["id"])
        region = page.get_by_role(
            "region", name="性质模型测试集复核" if zh else "Property model held-out review"
        )
        expect(region).to_be_visible(timeout=30000)
        page.screenshot(path=str(evidence / "initial-render.png"), full_page=True)
        expect(region.get_by_role("status").filter(has_text="R² ≤ 0")).to_contain_text("R² ≤ 0")
        chart = region.get_by_role("application")
        expect(chart).to_have_attribute("aria-busy", "false", timeout=60000)
        drawing = region.locator(".molecule-image")
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        # An isolated real marker avoids coincident-point ambiguity. Click through
        # Plotly's normal interaction layer with a real mouse event.
        point_index = min(
            range(len(result["validation_points"])),
            key=lambda index: result["validation_points"][index]["observed"],
        )
        marker = chart.locator(".scatterlayer .trace").first.locator(".point").nth(point_index)
        marker.scroll_into_view_if_needed()
        bounds = marker.bounding_box()
        assert bounds
        page.mouse.click(bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2)
        expect(
            region.get_by_role(
                "heading",
                name=("测试记录 " if zh else "Test record ") + str(point_index + 1),
                exact=True,
            )
        ).to_be_visible()
        drawing.scroll_into_view_if_needed()
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        region.get_by_label("查看记录" if zh else "Inspect record", exact=True).select_option("1")
        expect(
            region.get_by_role("heading", name="测试记录 2" if zh else "Test record 2", exact=True)
        ).to_be_visible()
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        table = region.get_by_role(
            "table", name="测试集逐分子误差" if zh else "Held-out errors by molecule"
        )
        error_column = (
            table.get_by_role("columnheader")
            .filter(has_text="偏差" if zh else "Error")
            .bounding_box()
        )
        viewport = region.locator(".research-table-scroll").bounding_box()
        assert error_column and viewport
        assert error_column["x"] >= viewport["x"] - 1
        assert error_column["x"] + error_column["width"] <= viewport["x"] + viewport["width"] + 1
        table.get_by_role("row").nth(3).click()
        expect(
            region.get_by_role("heading", name="测试记录 3" if zh else "Test record 3", exact=True)
        ).to_be_visible()
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        drawing.locator("img").evaluate("image => image.decode()")
        expect(chart).to_have_attribute("aria-busy", "false", timeout=60000)
        assert not region.locator('iframe[src*="viewer.html"]').count()
        left = region.locator(".structure-workbench-view").bounding_box()
        right = region.locator(".structure-workbench-details").bounding_box()
        assert left and right
        assert (
            (left["x"] < right["x"] and left["width"] > 450)
            if width > 1000
            else left["y"] < right["y"]
        )
        expect(page.get_by_role("link", name="property-model.pt", exact=True)).to_have_attribute(
            "href", f"/api/jobs/{job['id']}/download?name=property-model.pt"
        )
        page.screenshot(path=str(evidence / "weak-model-structure-errors.png"), full_page=True)
        with page.expect_download() as transfer:
            page.get_by_role("link", name="held-out-predictions.csv", exact=True).click()
        destination = evidence / "browser-held-out-predictions.csv"
        transfer.value.save_as(destination)
        assert destination.read_bytes() == original
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not writes, {"errors": errors, "api_writes": writes}
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "source_native_job": job["id"],
                    "ui_replay_only": True,
                    "new_training_or_inference": False,
                    "language": language,
                    "width": width,
                    "negative_performance_kept_visible": True,
                    "structures_on_left": True,
                    "linked_plot_record_and_error_table": True,
                    "native_plot_mouse_selection": True,
                    "original_csv_download": True,
                    "api_writes": writes,
                    "page_errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
