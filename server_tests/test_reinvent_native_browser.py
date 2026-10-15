"""One real 20-candidate fixed-port study through the deployed frontend, never MD/FEP."""

import os
import time
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.reinvent_case_evidence import retain_case
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.test_reinvent_review_browser import SCAFFOLD

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_REINVENT") != "1",
    reason="Native molecular research is explicit and runs on the selected CI/server only.",
)


def test_real_stat6_fixed_port_study():
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/reinvent-native")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        open_navigation(page, "en").get_by_role(
            "button", name="Small-molecule design", exact=True
        ).click()
        page.get_by_role("combobox", name="Research task", exact=True).select_option(
            "reinvent.design"
        )
        page.get_by_role(
            "combobox", name="How would you like to design molecules?", exact=True
        ).select_option("r_groups")
        page.get_by_role("textbox", name="Fragment structures (one per line)", exact=True).fill(
            SCAFFOLD
        )
        next_button = page.get_by_role("button", name="Next", exact=True)
        next_button.click()
        expect(
            page.get_by_role("region", name="Molecular design scope").locator(".molecule-image")
        ).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        next_button.click()
        page.get_by_role("radio", name="20 candidates", exact=True).check()
        page.get_by_role("button", name="Expert tuning", exact=True).click()
        page.get_by_role("spinbutton", name="CPU cores", exact=True).fill("2")
        page.get_by_role("spinbutton", name="Memory budget (MiB)", exact=True).fill("2048")
        page.get_by_role("spinbutton", name="Random seed", exact=True).fill("2026")
        next_button.click()
        page.get_by_role("textbox", name="Task name", exact=True).fill(
            "STAT6 · fixed-port R-group design · fluoroindole core · 20 analogues"
        )
        expect(
            page.get_by_role("table", name="Design plan review").get_by_role(
                "row", name="Candidate budget 20", exact=True
            )
        ).to_be_visible()
        page.screenshot(path=evidence / "submitted-scope.png", full_page=True)
        submit = page.get_by_role("button", name="Submit calculation", exact=True)
        expect(submit).to_be_enabled(timeout=45000)
        with page.expect_response(
            lambda response: (
                response.request.method == "POST" and response.url == base + "/api/jobs"
            )
        ) as pending:
            submit.click()
        response = pending.value
        assert response.status == 201, response.text()
        identifier = response.json()["id"]
        deadline = time.monotonic() + 900
        job = response.json()
        while job["status"] in {"queued", "running", "cancelling"} and time.monotonic() < deadline:
            time.sleep(1)
            status = page.request.get(base + "/api/jobs/" + identifier, timeout=15000)
            assert status.ok
            job = status.json()
        documents = retain_case(page, base, identifier, evidence / "case")
        page.screenshot(path=evidence / "native-result.png", full_page=True)
        assert job["status"] == "succeeded", {"job": job, "logs": documents["logs"]}
        request = job["request"]
        assert request["operation"] == "reinvent_design" and request["inputs"] == []
        assert request["payload"]["mode"] == "r_groups" and request["payload"]["fragments"] == [
            SCAFFOLD
        ]
        assert request["payload"]["candidates"] == 20
        assert request["options"] == {"device": "cpu", "cpu": 2, "memory_mib": 2048, "seed": 2026}
        assert not errors
        browser.close()
