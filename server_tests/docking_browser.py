"""Inspect actual GNINA results through the built frontend on the same persisted server state."""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


def inspect_results(settings, image, job_id, pose, reference, evidence, rejected_id=None):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(settings.state_dir),
        "WB_AUTO_DEPLOY": "0",
        "WB_GNINA_IMAGE": image,
        "WB_IMAGE_FILE": str(settings.image_file),
        "WB_CODE_FILE": str(settings.code_file),
        "WB_ALLOWED_ORIGINS": base,
    }
    with (evidence / "native-browser-server.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    try:
        for _attempt in range(60):
            try:
                with urllib.request.urlopen(base + "/api/health", timeout=2):
                    break
            except OSError:
                time.sleep(0.2)
        else:
            raise AssertionError("Actual persisted scientific preview did not start.")
        with urllib.request.urlopen(base + "/api/jobs", timeout=5) as response:
            expected_job_ids = {j["id"] for j in json.load(response)}
        errors = []
        downloads = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on(
                    "request",
                    lambda request: (
                        downloads.append(request.url) if "/download?" in request.url else None
                    ),
                )
                page.goto(base + "/#task=" + job_id)
                expect(
                    page.get_by_text(
                        "Empirical docking scores and model outputs are not measured affinity.",
                        exact=False,
                    )
                ).to_have_count(0)
                panel = page.get_by_role("region", name="Binding poses and next steps", exact=True)
                panel.get_by_role("button", name=f"Pose {pose['record'] + 1}", exact=True).click()
                expect(
                    panel.get_by_text("Drag to rotate · Scroll to zoom", exact=True)
                ).to_be_visible(timeout=30000)
                expect(
                    panel.frame_locator('iframe[title="Interactive molecular structure"]')
                    .locator("canvas")
                    .first
                ).to_be_visible()
                expect(
                    panel.get_by_role("button", name="Focus selected ligand", exact=True)
                ).to_be_visible()
                native_result = page.request.get(base + "/api/jobs/" + job_id + "/result").json()
                comparison = native_result.get("reference_comparison")
                if comparison and comparison["status"] == "ready":
                    table = panel.get_by_role(
                        "table", name="GNINA " + native_result["software_version"], exact=True
                    )
                    expect(
                        table.get_by_role("columnheader", name="Whole-pose RMSD (Å)", exact=False)
                    ).to_be_visible()
                    row = table.get_by_role("row").filter(
                        has=page.get_by_role(
                            "button", name=f"Pose {pose['record'] + 1}", exact=True
                        )
                    )
                    headers = table.get_by_role("columnheader").all_text_contents()
                    for title, key in (
                        ("Whole-pose RMSD", "all_heavy"),
                        ("Contact RMSD", "contact"),
                    ):
                        column = next(index for index, text in enumerate(headers) if title in text)
                        value = pose["reference_rmsd"][key]
                        expect(row.get_by_role("cell").nth(column)).to_have_text(
                            "—" if value is None else f"{value:.3f}"
                        )
                    panel.get_by_text("Compare with the reference pose", exact=True).click()
                    expect(
                        panel.get_by_text("without fitting the ligand", exact=False)
                    ).to_be_visible()
                panel.get_by_role("button", name="Surface", exact=True).click()
                expect(panel.get_by_text("Gray: no data", exact=True)).to_be_visible()
                panel.get_by_role("button", name="Backbone", exact=True).click()
                requested = [
                    parse_qs(urlparse(url).query).get("name", [None])[0] for url in downloads
                ]
                assert pose["artifact"] in requested and "receptor.pdb" in requested
                assert "poses.sdf" not in requested
                for width in (1440, 390):
                    page.set_viewport_size({"width": width, "height": 1000})
                    if not page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    ):
                        overflow = page.evaluate(
                            "Array.from(document.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>window.innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,120)})).slice(0,50)"
                        )
                        (evidence / "positive-overflow.json").write_text(
                            json.dumps(overflow, indent=2)
                        )
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    page.screenshot(
                        path=str(evidence / f"native-binding-results-{width}.png"), full_page=True
                    )
                panel.get_by_role("button", name="Calculate properties", exact=True).click()
                expect(
                    page.get_by_role("radio", name="Use the selected molecular file", exact=False)
                ).to_be_checked()
                page.get_by_role("button", name="Next", exact=True).click()
                expect(
                    page.locator('select:has(option[value="' + reference["asset_id"] + '"])')
                ).to_have_value(reference["asset_id"])
                expect(
                    page.get_by_text(
                        "Molecule record 1 is selected; only this record is calculated.", exact=True
                    )
                ).to_be_visible()
                assert {
                    j["id"] for j in page.request.get(base + "/api/jobs").json()
                } == expected_job_ids
                page.get_by_role("button", name="← Back to results", exact=True).click()
                expect(
                    panel.get_by_role("button", name=f"Pose {pose['record'] + 1}", exact=True)
                ).to_have_attribute("aria-pressed", "true")
                # Read the effective selected pose/method before dispatch, without
                # submitting a second scientific study from this browser check.
                panel.get_by_role("button", name="Rescore", exact=True).click()
                page.get_by_role("button", name="Next", exact=True).click()
                page.get_by_role("checkbox", name="I confirm", exact=False).check()
                page.get_by_role("button", name="Next", exact=True).click()
                page.get_by_role("combobox", name="Run preset", exact=True).select_option("expert")
                page.get_by_role("spinbutton", name="CPU threads", exact=True).fill("1")
                page.get_by_role("button", name="Next", exact=True).click()
                review = page.get_by_role(
                    "table", name="Materials and calculation plan", exact=True
                )
                expect(review).to_contain_text(pose["artifact"])
                expect(review).to_contain_text("VINA")
                expect(review).to_contain_text("CPU × 1")
                expect(review).to_contain_text("coordinates unchanged")
                page.screenshot(path=str(evidence / "native-scoring-review.png"), full_page=True)
                assert {
                    j["id"] for j in page.request.get(base + "/api/jobs").json()
                } == expected_job_ids
                page.get_by_role("button", name="← Back to results", exact=True).click()
                if rejected_id:
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.goto(base + "/#task=" + rejected_id)
                    rejected_panel = page.get_by_role(
                        "region", name="Binding poses and next steps", exact=True
                    )
                    expect(
                        rejected_panel.get_by_role("button", name="Pose 1", exact=True)
                    ).to_be_disabled()
                    expect(
                        rejected_panel.get_by_role("cell").filter(
                            has_text="Excluded: hard spatial condition failed"
                        )
                    ).to_be_visible()
                    rejected_panel.get_by_role(
                        "button", name="Inspect rejected pose", exact=True
                    ).click()
                    expect(
                        rejected_panel.get_by_text("Drag to rotate · Scroll to zoom", exact=True)
                    ).to_be_visible(timeout=30000)
                    expect(
                        rejected_panel.frame_locator(
                            'iframe[title="Interactive molecular structure"]'
                        )
                        .locator("canvas")
                        .first
                    ).to_be_visible()
                    rejected_panel.get_by_text("Inspect violation positions", exact=True).click()
                    expect(
                        rejected_panel.get_by_text("Output atom 1 ·", exact=False)
                    ).to_be_visible()
                    expect(
                        rejected_panel.get_by_role(
                            "button", name="Calculate properties", exact=True
                        )
                    ).to_have_count(0)
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        if not page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        ):
                            overflow = page.evaluate(
                                "Array.from(document.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>window.innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,120)})).slice(0,50)"
                            )
                            (evidence / "diagnostic-overflow.json").write_text(
                                json.dumps(overflow, indent=2)
                            )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        )
                        page.screenshot(
                            path=str(evidence / f"rejected-binding-results-{width}.png"),
                            full_page=True,
                        )
                    assert {
                        j["id"] for j in page.request.get(base + "/api/jobs").json()
                    } == expected_job_ids
                assert errors == []
                (evidence / "native-browser-acceptance.json").write_text(
                    json.dumps(
                        {
                            "job_id": job_id,
                            "pose": pose["artifact"],
                            "reference": reference,
                            "downloaded_artifacts": requested,
                            "errors": errors,
                        },
                        indent=2,
                    )
                )
            except Exception:
                page.screenshot(path=str(evidence / "native-browser-failure.png"), full_page=True)
                frames = []
                for frame in page.frames:
                    frames.append(
                        {
                            "url": frame.url,
                            "text": frame.locator("body").inner_text(timeout=2000)[:20000],
                        }
                    )
                (evidence / "native-browser-failure.json").write_text(
                    json.dumps(
                        {
                            "page_errors": errors,
                            "alerts": page.get_by_role("alert").all_text_contents(),
                            "body": page.locator("body").inner_text()[:30000],
                            "frames": frames,
                            "downloaded_artifacts": downloads,
                        },
                        indent=2,
                        ensure_ascii=False,
                    )
                )
                raise
            finally:
                browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
