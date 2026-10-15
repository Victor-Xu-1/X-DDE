"""One real 20-candidate fixed-port study through the deployed frontend, never MD/FEP."""

import os
import re
import time
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6.catalogue import FILES
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
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
        page.add_init_script("""window.addEventListener('message', event => {
          const frame = document.querySelector('.scientific-results .molecular-preview iframe');
          if (event.origin === location.origin && event.source === frame?.contentWindow &&
              event.data?.channel === 'opendde-viewer' && event.data.type === 'loaded')
            document.documentElement.dataset.reinventAtoms = String(event.data.detail.atoms);
        });""")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        open_navigation(page, "en").get_by_role(
            "button", name="Small-molecule design", exact=True
        ).click()
        page.get_by_role("combobox", name="Research task", exact=True).select_option(
            "reinvent.design"
        )
        page.get_by_role("button", name="Use this template", exact=True).click()
        expect(page.get_by_role("button", name="New blank task", exact=True)).to_be_visible(
            timeout=45000
        )
        next_button = page.get_by_role("button", name="Next", exact=True)
        expect(next_button).to_be_enabled(timeout=45000)
        page.get_by_role(
            "combobox", name="How would you like to design molecules?", exact=True
        ).select_option("r_groups")
        expect(
            page.get_by_role("checkbox", name="Verify the scaffold's source molecule", exact=True)
        ).to_be_checked()
        page.get_by_role("textbox", name="Fragment structures (one per line)", exact=True).fill(
            SCAFFOLD
        )
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
        expect(
            page.get_by_role("table", name="Design plan review").get_by_role(
                "row",
                name="Scaffold source molecule " + FILES["study_ligand"].name + " · Record 1",
                exact=True,
            )
        ).to_be_visible(timeout=45000)
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
        page.screenshot(path=evidence / "native-result-initial.png", full_page=True)
        assert job["status"] == "succeeded", {"job": job, "logs": documents["logs"]}
        request = job["request"]
        assert request["operation"] == "reinvent_design" and len(request["inputs"]) == 1
        assert request["inputs"][0]["role"] == "ligand"
        source = request["inputs"][0]["source"]
        assert source["sha256"] == FILES["study_ligand"].sha256
        assert source["record"] == 0 and source["conformer"] == 0
        assert request["scientific_inputs"] == [source]
        assert request["payload"]["validate_scaffold_origin"] is True
        assert request["payload"]["mode"] == "r_groups" and request["payload"]["fragments"] == [
            SCAFFOLD
        ]
        assert request["payload"]["candidates"] == 20
        assert request["options"] == {"device": "cpu", "cpu": 2, "memory_mib": 2048, "seed": 2026}
        expect(page.locator("html")).to_have_attribute(
            "data-reinvent-atoms", re.compile(r"^[1-9]\d*$"), timeout=60000
        )
        page.screenshot(path=evidence / "native-result.png", full_page=True)
        with page.expect_download() as download:
            page.get_by_role("button", name="Capture 3D view", exact=True).click()
        image = evidence / "native-3d-view.png"
        download.value.save_as(image)
        assert image.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
        page.get_by_role("tab", name="2D structure", exact=True).click()
        expect(
            page.locator(".scientific-results .molecular-preview .molecule-image")
        ).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        page.screenshot(path=evidence / "native-result-2d.png", full_page=True)
        if len(documents["result"]["candidates"]) > 1:
            second = documents["result"]["candidates"][1]["id"]
            page.evaluate("delete document.documentElement.dataset.reinventAtoms")
            page.get_by_role("row").filter(has=page.get_by_text(second, exact=True)).click()
            expect(page.locator("html")).to_have_attribute(
                "data-reinvent-atoms", re.compile(r"^[1-9]\d*$"), timeout=60000
            )
            page.screenshot(path=evidence / "native-result-second.png", full_page=True)
        jobs = page.request.get(base + "/api/jobs").json()
        assert isinstance(jobs, list) and {row["id"] for row in jobs} == {identifier}, jobs
        assert not errors
        browser.close()
