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
                panel = page.get_by_role("region", name="结合模式与下一步", exact=True)
                panel.get_by_role("button", name=f"姿势 {pose['record'] + 1}", exact=True).click()
                expect(panel.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                    timeout=30000
                )
                expect(
                    panel.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                ).to_be_visible()
                expect(panel.get_by_role("button", name="定位所选配体", exact=True)).to_be_visible()
                expect(panel.get_by_role("button", name="分子表面", exact=True)).to_have_count(0)
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
                assert {
                    j["id"] for j in page.request.get(base + "/api/jobs").json()
                } == expected_job_ids
                if rejected_id:
                    page.goto(base + "/#task=" + rejected_id)
                    rejected_panel = page.get_by_role("region", name="结合模式与下一步", exact=True)
                    expect(
                        rejected_panel.get_by_role("button", name="姿势 1", exact=True)
                    ).to_be_disabled()
                    expect(
                        rejected_panel.get_by_text("已排除：未满足硬空间条件", exact=True)
                    ).to_be_visible()
                    rejected_panel.get_by_role("button", name="检查不合格姿势", exact=True).click()
                    expect(
                        rejected_panel.get_by_text("拖动旋转 · 滚轮缩放", exact=True)
                    ).to_be_visible(timeout=30000)
                    rejected_panel.get_by_text("查看违反位置", exact=True).click()
                    expect(rejected_panel.get_by_text("输出原子 1 ·", exact=False)).to_be_visible()
                    expect(
                        rejected_panel.get_by_role("button", name="计算性质", exact=True)
                    ).to_have_count(0)
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
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
