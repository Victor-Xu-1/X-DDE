"""Actual compiled pages over the same native fixture, never a fabricated result."""

import hashlib
import json
import os
import time
from unittest.mock import patch

from browser_platform import platform
from flexible_receptor_questionnaire import inspect_questionnaire
from playwright.sync_api import expect, sync_playwright

CONFIRM = "I confirm the reference/existing pose is in the selected receptor coordinate frame"


def submit_score(page, base, pair, root, submissions, before):
    # The live result action must initialize the real questionnaire with
    # the updated receptor, not the original protein's coordinate version.
    page.get_by_role("button", name="Rescore", exact=True).click()
    page.get_by_role("button", name="Next", exact=True).click()
    page.get_by_role(
        "checkbox",
        name=CONFIRM,
        exact=True,
    ).check()
    page.get_by_role("button", name="Next", exact=True).click()
    page.get_by_role("combobox", name="Run preset", exact=True).select_option("expert")
    for label, value in (
        ("CPU threads", "1"),
        ("Memory limit MiB", "2048"),
        ("Time limit (seconds)", "60"),
    ):
        page.get_by_role("spinbutton", name=label, exact=True).fill(value)
    page.get_by_role("button", name="Next", exact=True).click()
    page.get_by_role("button", name="Score existing pose", exact=True).click()
    expect(page.get_by_role("region", name="Submitted task", exact=True)).to_be_visible(
        timeout=10000
    )
    assert len(submissions) == 1
    sent = submissions[0]
    assert sent["receptor"] == pair["receptor"] and sent["ligand"] == pair["ligand"]
    assert sent["pose_frame"] == pair["receptor"] and sent["mode"] == "score"
    assert "flexible_receptor" not in sent
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        jobs = page.request.get(base + "/api/jobs").json()
        added = [job for job in jobs if job["id"] not in before]
        if len(added) == 1 and added[0]["status"] in {
            "succeeded",
            "failed",
            "cancelled",
        }:
            assert added[0]["status"] == "succeeded", added[0]
            break
        time.sleep(0.2)
    else:
        raise AssertionError("Actual frontend score task did not finish within its bounded window.")
    (root / "frontend-submission.json").write_text(
        json.dumps({"submitted": sent, "job": added[0]}, indent=2)
    )
    before.add(added[0]["id"])


def inspect_refinement_browser(settings, image, identifier, source, pair, result, root):
    env = {
        "WB_GNINA_IMAGE": image,
        "WB_IMAGE_FILE": str(settings.image_file),
        "WB_CODE_FILE": str(settings.code_file),
    }
    receipt = result["receptor_refinement"]
    observations = []
    with (
        patch.dict(os.environ, env),
        platform(settings.state_dir, root / "browser-service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        try:
            for language, width in (("en", 1440), ("zh", 390)):
                zh = language == "zh"
                context = browser.new_context(
                    viewport={"width": width, "height": 1000}, accept_downloads=True
                )
                context.add_init_script(
                    f"localStorage.setItem('opendde-workbench.language','{language}')"
                )
                page = context.new_page()
                errors, submissions = [], []
                page.on("pageerror", lambda error, target=errors: target.append(str(error)))
                page.on(
                    "request",
                    lambda request, target=submissions: (
                        target.append(request.post_data_json)
                        if request.method == "POST" and request.url == base + "/api/jobs"
                        else None
                    ),
                )
                page.goto(base + "/#task=" + identifier)
                summary = page.get_by_text(
                    "蛋白侧链局部调整" if zh else "Local receptor sidechain adjustment", exact=True
                )
                summary.click()
                expect(page.get_by_text("A:111, A:118, A:133, A:153", exact=True)).to_be_visible()
                download = page.get_by_role(
                    "link",
                    name="下载调整后蛋白" if zh else "Download adjusted receptor",
                    exact=True,
                )
                with page.expect_download() as captured:
                    download.click()
                path = root / (language + "-downloaded-receptor.pdb")
                captured.value.save_as(path)
                assert hashlib.sha256(path.read_bytes()).hexdigest() == receipt["receptor_sha256"]
                expect(
                    page.frame_locator('iframe[title="Interactive molecular structure"]')
                    .locator("canvas")
                    .first
                ).to_be_visible(timeout=30000)
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
                page.screenshot(
                    path=root / (language + "-actual-refined-result.png"), full_page=True
                )
                before = {job["id"] for job in page.request.get(base + "/api/jobs").json()}
                if not zh:
                    submit_score(page, base, pair, root, submissions, before)
                inspect_questionnaire(page, base, source, pair, zh, root, before, CONFIRM)
                assert not errors, errors
                observations.append(
                    {
                        "language": language,
                        "width": width,
                        "native_result_download_hash": receipt["receptor_sha256"],
                        "explicit_residue_in_review": "A:111",
                        "selector_did_not_dispatch": True,
                    }
                )
                context.close()
        finally:
            browser.close()
    (root / "browser-acceptance.json").write_text(json.dumps(observations, indent=2))
