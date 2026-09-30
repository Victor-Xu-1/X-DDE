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


def inspect_results(settings, image, job_id, pose, reference, evidence):
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
                panel = page.get_by_role("region", name="结合模式与下一步", exact=True)
                panel.get_by_role("button", name=f"姿势 {pose['record'] + 1}", exact=True).click()
                expect(panel.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                    timeout=30000
                )
                expect(
                    panel.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                ).to_be_visible()
                requested = [
                    parse_qs(urlparse(url).query).get("name", [None])[0] for url in downloads
                ]
                assert pose["artifact"] in requested and "receptor.pdb" in requested
                assert "poses.sdf" not in requested
                for width in (1440, 390):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    page.screenshot(
                        path=str(evidence / f"native-binding-results-{width}.png"), full_page=True
                    )
                panel.get_by_role("button", name="计算性质", exact=True).click()
                expect(panel.locator(".tool-form select").last).to_have_value(reference["asset_id"])
                assert len(page.request.get(base + "/api/jobs").json()) == 4
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
            finally:
                browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
