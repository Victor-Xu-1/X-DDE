"""Actual 2D record -> shared 3D view -> native computed child, never a flat 3D display."""

import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def test_initial_admet_ligand_is_computed_saved_and_reused_in_the_real_browser():
    evidence = Path("server_tests/evidence/initial-pose").resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    config = json.loads(
        Path("server_tests/evidence/pose-minimization/browser-config.json").read_text()
    )
    state = evidence / "state"
    assert not state.exists()
    shutil.copytree(Path(os.environ["WB_MIN_REFERENCE_STATE"]), state)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_HOME": str(evidence / "home"),
        "WB_STATE_DIR": str(state),
        "WB_CHEMISTRY_IMAGE": config["chemistry_image"],
        "WB_ALLOWED_ORIGINS": base,
        "WB_AUTO_DEPLOY": "0",
    }
    with (evidence / "service.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(40):
                try:
                    with urlopen(base + "/api/health", timeout=2) as response:
                        assert json.load(response)["worker_ready"]
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise AssertionError("The isolated native preview service did not start.")
            with sync_playwright() as driver:
                browser = driver.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda value: errors.append(str(value)))
                page.add_init_script(
                    """window.addEventListener('message', event => {
                      const frame = document.querySelector(
                        '.admet-selected-molecule .molecular-stage iframe');
                      if (event.origin === location.origin &&
                          event.source === frame?.contentWindow &&
                          event.data?.channel === 'opendde-viewer' &&
                          event.data.type === 'loaded')
                        document.documentElement.dataset.initialAtoms =
                          String(event.data.detail.atoms);
                    });"""
                )
                page.goto(base)
                before = page.request.get(base + "/api/jobs").json()
                info = page.request.get(base + "/api/examples/admet.predict").json()
                report = page.request.get(base + f"/api/jobs/{info['pin']['job_id']}/result").json()
                assert report["models_executed"] and len(report["endpoints"]) == 41
                original = page.request.get(
                    base + "/api/assets/" + report["source"]["asset_id"]
                ).body()
                assert hashlib.sha256(original).hexdigest() == report["source"]["sha256"]
                page.get_by_role("navigation", name="Main navigation", exact=True).get_by_role(
                    "button", name="Properties and safety", exact=True
                ).click()
                page.get_by_role("button", name="Example results", exact=True).click()
                panel = page.get_by_role("region", name="Selected molecule", exact=True)
                expect(panel.locator(".molecule-image")).to_have_attribute(
                    "data-drawing-state", "ready", timeout=45000
                )
                expect(panel.locator(".molecular-stage")).to_have_count(0)
                panel.get_by_role("tab", name="3D structure", exact=True).click()
                expect(
                    panel.get_by_text("Preparing an optimized 3D conformer…", exact=True)
                ).to_be_visible(timeout=30000)
                expect(page.locator("html")).to_have_attribute(
                    "data-initial-atoms", re.compile(r"^[1-9][0-9]+$"), timeout=180000
                )
                expect(panel.locator(".initial-pose-status")).to_have_count(0)
                after = page.request.get(base + "/api/jobs").json()
                added = [job for job in after if job["id"] not in {old["id"] for old in before}]
                assert len(added) == 1 and added[0]["request"]["operation"] == "molecule_minimize"
                calculation = page.request.get(base + f"/api/jobs/{added[0]['id']}/result").json()
                assert calculation["initialization"] == "ETKDGv3" and calculation["converged"]
                poses = page.request.get(
                    base + f"/api/research/objects?source_job={added[0]['id']}"
                ).json()
                pose = next(item for item in poses if item["kind"] == "molecule")
                assert pose["source_job"] == added[0]["id"]
                assert (
                    page.request.get(base + "/api/assets/" + report["source"]["asset_id"]).body()
                    == original
                )
                for width in (1440, 768, 390):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert not page.evaluate(
                        "document.documentElement.scrollWidth > innerWidth + 1"
                    )
                    panel.scroll_into_view_if_needed()
                    page.screenshot(path=evidence / f"initial-calculated-3d-{width}.png")
                page.set_viewport_size({"width": 1440, "height": 1000})
                # Leaving and reopening the same source reuses its calculation.
                page.get_by_role("navigation", name="Main navigation", exact=True).get_by_role(
                    "button", name="Structure prediction", exact=True
                ).click()
                page.get_by_role("navigation", name="Main navigation", exact=True).get_by_role(
                    "button", name="Properties and safety", exact=True
                ).click()
                page.get_by_role("button", name="Example results", exact=True).click()
                panel.get_by_role("tab", name="3D structure", exact=True).click()
                expect(panel.locator(".initial-pose-status")).to_have_count(0, timeout=45000)
                assert len(page.request.get(base + "/api/jobs").json()) == len(after)
                assert (
                    page.request.get(base + f"/api/jobs/{info['pin']['job_id']}/result").json()
                    == report
                )
                assert not errors, errors
                (evidence / "native-initial-pose.json").write_text(
                    json.dumps(
                        {
                            "source_job": info["pin"]["job_id"],
                            "calculation": calculation,
                            "pose": pose,
                            "original_source_preserved": True,
                            "admet_recomputation": False,
                            "source_reopen_reused": True,
                        },
                        indent=2,
                    )
                )
                browser.close()
        finally:
            process.terminate()
            process.wait(timeout=20)
