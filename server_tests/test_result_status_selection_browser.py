"""A real pending read cannot change a physical pose-selection gesture."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_result_handoff_browser import native_source


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_completing_artifact_read_preserves_the_pressed_pose(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("gnina.dock", verify=True)
    original = store.get(str(pin.job_id))
    source, _ = native_source(settings, store, original, "Read-status selection boundary")
    evidence = Path("outputs/result-handoff") / ("read-status-" + language)
    evidence.mkdir(parents=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        held = []

        def hold_artifacts(route):
            response = route.fetch()
            assert response.ok
            held.append((route, response))

        page.route(f"**/api/jobs/{source.id}/artifacts", hold_artifacts)
        page.goto(base + "/#task=" + source.id)
        result = page.locator(".docking-results")
        button = result.get_by_role("button", name="姿势 2" if zh else "Pose 2", exact=True)
        expect(button).to_be_enabled()
        notice = page.get_by_text("正在读取任务文件…" if zh else "Loading task files…", exact=True)
        expect(notice).to_be_visible()
        button.scroll_into_view_if_needed()
        before = button.bounding_box()
        assert before and held
        x, y = before["x"] + before["width"] / 2, before["y"] + before["height"] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.unroute(f"**/api/jobs/{source.id}/artifacts", hold_artifacts)
        held[0][0].fulfill(response=held[0][1])
        expect(notice).not_to_be_visible()
        after = button.bounding_box()
        page.mouse.up()
        page.screenshot(path=evidence / "completed-read-selection.png", full_page=True)
        (evidence / "gesture.json").write_text(json.dumps({"before": before, "after": after}))
        expect(button).to_have_attribute("aria-pressed", "true")
        first = result.get_by_role("button", name="姿势 1" if zh else "Pose 1", exact=True)
        expect(first).to_have_attribute("aria-pressed", "false")
        browser.close()
