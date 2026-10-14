"""Real retained results: view first, roomy canvas, stable native identity; no inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform


@pytest.mark.parametrize("width", [1440, 390])
def test_retained_stat6_views_lead_and_keep_their_selected_result(width):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pins = ExamplePins(store, settings.state_dir, modules=MODULES)
    capabilities = [
        "gnina.dock",
        "p2rank.detect",
        "biopython.prepare",
        "biopython.exposure",
        "biopython.ensemble",
        "posebusters.check",
        "diffsbdd.interactions",
    ]
    evidence = Path("outputs/structure-workbench") / str(width)
    evidence.mkdir(parents=True, exist_ok=True)
    before = {job.id: job.status for job in store.list_jobs()}
    receipts = []
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960})
        for capability in capabilities:
            pin = pins.get(capability, verify=True)
            assert pin, capability
            page.goto(base + "/#task=" + str(pin.job_id))
            layout = page.locator(".structure-workbench").first
            expect(layout).to_be_visible(timeout=30000)
            view = layout.locator(".structure-workbench-view").first
            data = layout.locator(".structure-workbench-details").first
            expect(view.locator(".molecular-stage").first).to_be_visible(timeout=30000)
            expect(view.get_by_role("button", name="Export figure ↓").first).to_be_enabled(
                timeout=30000
            )
            vp = view.bounding_box()
            dp = data.bounding_box()
            assert vp and dp
            if width > 1000:
                assert vp["x"] + vp["width"] <= dp["x"] + 2
                assert vp["width"] > dp["width"] * 1.45, (capability, vp, dp)
                assert abs(vp["y"] - dp["y"]) < 3
            else:
                assert vp["y"] < dp["y"]
            canvas = view.locator(".molecular-stage").first.bounding_box()
            assert canvas["height"] >= (500 if width > 1000 else 340)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
            page.screenshot(path=str(evidence / (capability + ".png")), full_page=True)
            receipts.append(
                {
                    "capability": capability,
                    "job_id": str(pin.job_id),
                    "view": vp,
                    "data": dp,
                    "canvas": canvas,
                }
            )
        browser.close()
    assert {job.id: job.status for job in store.list_jobs()} == before
    (evidence / "geometry.json").write_text(json.dumps(receipts, indent=2))
