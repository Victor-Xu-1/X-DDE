"""Select atoms in the actual 3D canvas and submit one native restrained refinement."""

import json
import os
import time
from pathlib import Path

import pytest
from browser_platform import platform
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_OPENMM_CONDITIONS") != "1",
    reason="Explicit isolated native OpenMM condition acceptance only; no dynamics",
)


def test_real_3d_selection_and_native_refinement():
    assert os.environ.get("CI") == "true"
    root = Path(os.environ["WB_MOL1_CASE"])
    assert root.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    with platform(root / "state", root / "browser-server.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch()
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.goto(base + "/#view=new&tool=openmm.refine")
            with page.expect_response(
                lambda response: (
                    "/api/assets?" in response.url and response.request.method == "POST"
                )
            ) as upload:
                page.get_by_label("Upload Choose target structure", exact=True).set_input_files(
                    root / "STAT6-SH2-source.pdb"
                )
            assert upload.value.status == 201 and upload.value.json()["kind"] == "structure"
            next_step = page.get_by_role("button", name="Next", exact=True)
            expect(next_step).to_be_enabled(timeout=30000)
            page.screenshot(path=str(root / "openmm-input-en.png"), full_page=True)
            next_step.click()
            next_step.click()
            add = page.get_by_role("button", name="Add to task", exact=True)
            expect(add).to_be_disabled()
            view = page.frame_locator('iframe[title="Interactive molecular structure"]')
            canvas = view.locator("canvas").first
            expect(canvas).to_be_visible(timeout=60000)
            # Exercise mouse picking itself; no internal viewer or React state injection.
            for y in (0.5, 0.4, 0.6, 0.3, 0.7):
                for x in (0.5, 0.4, 0.6, 0.3, 0.7):
                    bounds = canvas.bounding_box()
                    canvas.click(position={"x": bounds["width"] * x, "y": bounds["height"] * y})
                    page.wait_for_timeout(100)
                    if add.is_enabled():
                        break
                if add.is_enabled():
                    break
            expect(add).to_be_enabled()
            add.click()
            expect(page.get_by_role("button", name="Remove restraint 1")).to_be_visible()
            page.screenshot(path=str(root / "openmm-3d-condition-en.png"), full_page=True)
            next_step.click()
            page.get_by_role("combobox", name="Refinement budget").select_option("250")
            next_step.click()
            with page.expect_response(
                lambda response: (
                    response.url.endswith("/api/jobs") and response.request.method == "POST"
                )
            ) as response:
                page.get_by_role("button", name="Submit calculation", exact=True).click()
            assert response.value.status in {200, 201}, response.value.text()
            request = response.value.request.post_data_json
            assert request["operation"] == "structure_refine"
            conditions = request["payload"]["restraints"]
            assert len(conditions) == 1 and conditions[0]["kind"] == "position"
            assert conditions[0]["atom"]["source"] == request["inputs"][0]["source"]
            identifier = response.value.json()["id"]
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                job = page.request.get(base + "/api/jobs/" + identifier).json()
                if job["status"] in {"succeeded", "failed", "cancelled"}:
                    break
                time.sleep(1)
            (root / "job.json").write_text(json.dumps(job, indent=2))
            if job["status"] != "succeeded":
                log = page.request.get(base + f"/api/jobs/{identifier}/logs").json()["text"]
                (root / "native-task.log").write_text(log)
                print(log[-15000:])
            assert job["status"] == "succeeded", job
            result = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            assert "restraints.json" in result["artifact_sha256"]
            receipt = page.request.get(
                base + f"/api/jobs/{identifier}/download?name=restraints.json"
            ).json()
            assert [row["condition"] for row in receipt["conditions"]] == conditions
            (root / "restraints.json").write_text(json.dumps(receipt, indent=2))
            page.screenshot(path=str(root / "openmm-result-en.png"), full_page=True)
            (root / "acceptance.json").write_text(
                json.dumps(
                    {
                        "job_id": identifier,
                        "actual_canvas_selection": True,
                        "frontend_submission": True,
                        "native_harmonic_force_receipt": True,
                        "dynamics_or_fep_executed": False,
                    },
                    indent=2,
                )
            )
            browser.close()
