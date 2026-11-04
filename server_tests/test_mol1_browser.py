"""Real compiled UI -> task API -> native Mol-1 -> CIF/confidence/download, in CI only."""

import hashlib
import json
import os
import time
from pathlib import Path

import pytest
from browser_platform import platform
from native_viewer_evidence import capture_structure
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_MOL1_NATIVE") != "1",
    reason="Explicit isolated native Mol-1 acceptance only",
)


def test_frontend_submits_real_mol1_and_retains_native_outputs():
    root = Path(os.environ["WB_MOL1_CASE"])
    assert os.environ.get("CI") == "true"
    assert root.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    errors = []
    with platform(root / "state", root / "browser-server.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base + "/#view=new&tool=mol1.predict")
            inputs = page.get_by_role("textbox")
            # Trp-cage is an engineering integration input, not a drug-discovery template.
            inputs.nth(0).fill("NLYIQWLKDGGPSSGRPPPS")
            inputs.nth(1).fill("CCD_ATP")
            next_step = page.get_by_role("button", name="Next", exact=True)
            next_step.click()
            page.get_by_role("combobox", name="Sequence evolutionary information").select_option(
                "none"
            )
            next_step.click()
            page.get_by_role("spinbutton", name="Structures per seed").fill("1")
            page.get_by_role("spinbutton", name="Recycling cycles").fill("1")
            page.get_by_role("spinbutton", name="Diffusion steps").fill("20")
            page.get_by_role("combobox", name="Compute device").select_option("cpu")
            page.get_by_role("spinbutton", name="Memory limit (MiB)").fill("12288")
            next_step.click()
            page.get_by_role("textbox", name="Task name (optional)").fill(
                "Mol-1 native integration"
            )
            page.get_by_role("button", name="Preview job", exact=True).click()
            review = page.get_by_role("dialog", name="Preview job", exact=True)
            review.get_by_role("button", name="Request JSON", exact=True).click()
            reviewed = json.loads(review.get_by_label("X-DDE submission request").inner_text())
            page.screenshot(path=str(root / "mol1-review-en.png"), full_page=True)
            submit = review.get_by_role("button", name="Submit job", exact=True)
            expect(submit).to_be_enabled(timeout=120000)
            with page.expect_response(
                lambda response: (
                    response.url.endswith("/api/jobs") and response.request.method == "POST"
                )
            ) as response:
                submit.click()
            created = response.value
            assert created.status in {200, 201}, created.text()
            submitted = created.request.post_data_json
            assert submitted == reviewed
            assert submitted["operation"] == "mol1_predict"
            assert submitted["payload"]["dtype"] == "fp32"
            assert submitted["payload"]["samples"] == 1
            identifier = created.json()["id"]
            deadline = time.monotonic() + 2400
            while time.monotonic() < deadline:
                job = page.request.get(base + "/api/jobs/" + identifier).json()
                if job["status"] in {"succeeded", "failed", "cancelled"}:
                    break
                time.sleep(2)
            (root / "job.json").write_text(json.dumps(job, indent=2))
            if job["status"] != "succeeded":
                diagnostic = page.request.get(base + f"/api/jobs/{identifier}/logs").json()["text"]
                (root / "native-task.log").write_text(diagnostic)
                print(diagnostic[-18000:])
            assert job["status"] == "succeeded", job
            native = page.request.get(base + "/api/jobs/" + identifier + "/result").json()
            (root / "native-result.json").write_text(json.dumps(native, indent=2))
            assert native["program"] == "mol1", native
            candidate = native["candidates"][0]
            assert candidate["geometry"] == "predicted_structure"
            for file, digest in native["artifact_sha256"].items():
                data = page.request.get(base + f"/api/jobs/{identifier}/download?name={file}")
                assert data.ok, file
                assert hashlib.sha256(data.body()).hexdigest() == digest, file
                if file == candidate["artifact"]:
                    (root / "native-structure.cif").write_bytes(data.body())
            page.goto(base + "/#task=" + identifier)
            expect(page.get_by_role("combobox", name="Confidence view")).to_be_visible(
                timeout=60000
            )
            page.get_by_role("button", name="Backbone", exact=True).click()
            page.get_by_role("button", name="Full structure", exact=True).click()
            pixels = capture_structure(page, root / "mol1-structure-en.png")
            for view in ("atom_plddt", "token_pair_pae", "token_pair_pde", "contact_probs"):
                page.get_by_role("combobox", name="Confidence view").select_option(view)
                expect(page.locator(".mol1-confidence .js-plotly-plot")).to_be_visible(
                    timeout=30000
                )
            page.screenshot(path=str(root / "mol1-result-en.png"), full_page=True)
            page.evaluate("localStorage.setItem('opendde-workbench.language','zh')")
            page.reload()
            expect(page.get_by_role("combobox", name="置信度视图")).to_be_visible(timeout=60000)
            page.screenshot(path=str(root / "mol1-result-zh.png"), full_page=True)
            assert not errors, errors
            (root / "acceptance.json").write_text(
                json.dumps(
                    {
                        "job_id": identifier,
                        "frontend_submission": True,
                        "native_result": True,
                        "downloads_verified": True,
                        "confidence_views": 4,
                        "rendered_structure_pixels": pixels,
                        "languages": ["en", "zh"],
                        "scientific_template_promotion": False,
                    },
                    indent=2,
                )
            )
            browser.close()
