"""Actual Chromium click → API → native force field → saved pose → undo/redo/download."""

import hashlib
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def test_real_preview_minimization_history_and_download():
    evidence = Path("server_tests/evidence/pose-minimization").resolve()
    config = json.loads((evidence / "browser-config.json").read_text())
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_HOME": str(evidence / "browser-home"),
        "WB_STATE_DIR": str(evidence / "state"),
        "WB_CHEMISTRY_IMAGE": config["chemistry_image"],
        "WB_GNINA_IMAGE": config["gnina_image"],
        "WB_ALLOWED_ORIGINS": base,
        "WB_AUTO_DEPLOY": "0",
    }
    with (evidence / "browser-service.log").open("w") as log:
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
                raise AssertionError("The isolated service did not start.")
            with sync_playwright() as driver:
                browser = driver.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1100})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(base + "/#task=" + config["free_job"])
                action = page.get_by_role("button", name="能量最小化", exact=True)
                expect(action).to_be_visible(timeout=30000)
                original = page.locator("iframe[title='可交互分子结构']")
                action.scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / "preview-before.png"))
                with page.expect_response(
                    lambda response: (
                        response.url.endswith("/api/research/poses/minimize")
                        and response.request.method == "POST"
                    )
                ) as event:
                    action.click()
                assert event.value.status == 201
                job = event.value.json()
                previous = page.get_by_role("button", name="回到上一个 pose", exact=True)
                expect(previous).to_be_enabled(timeout=180000)
                expect(page.get_by_text("pose 2/2 · 已保存", exact=True)).to_be_visible()
                expect(page.locator(".pose-energy")).to_contain_text("MMFF94s")
                expect(page.get_by_role("link", name="下载当前 pose", exact=True)).to_be_visible()
                page.screenshot(path=str(evidence / "preview-saved.png"))
                href = page.get_by_role("link", name="下载当前 pose", exact=True).get_attribute(
                    "href"
                )
                with page.expect_download() as download:
                    page.get_by_role("link", name="下载当前 pose", exact=True).click()
                file = evidence / "downloaded-optimized-pose.sdf"
                download.value.save_as(file)
                with urlopen(base + f"/api/jobs/{job['id']}/result", timeout=10) as response:
                    result = json.load(response)
                assert hashlib.sha256(file.read_bytes()).hexdigest() == result["artifact_sha256"]
                previous.click()
                expect(page.get_by_text("pose 1/2", exact=True)).to_be_visible()
                expect(page.locator(".pose-energy")).not_to_be_visible()
                page.get_by_role("button", name="下一个 pose", exact=True).click()
                expect(page.get_by_text("pose 2/2 · 已保存", exact=True)).to_be_visible()
                expect(
                    page.get_by_role("link", name="下载当前 pose", exact=True)
                ).to_have_attribute("href", href)
                page.goto(base + "/#task=" + config["bound_job"])
                expect(page.get_by_role("button", name="受体内最小化", exact=True)).to_be_visible(
                    timeout=30000
                )
                assert not page.get_by_role("button", name="局部最小化", exact=True).count()
                assert original.count() == 1
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                page.screenshot(path=str(evidence / "bound-pose-controls.png"))
                assert not errors, errors
                (evidence / "browser-acceptance.json").write_text(
                    json.dumps(
                        {
                            "new_job": job["id"],
                            "download_sha256": result["artifact_sha256"],
                            "undo_redo": True,
                            "bound_control": True,
                            "errors": errors,
                        },
                        indent=2,
                    )
                )
                browser.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
