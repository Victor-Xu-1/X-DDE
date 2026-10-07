"""Real original-frame channels, exports, fixed module and one-step submission."""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_native_channels_and_fresh_submission():
    output = Path(os.environ["WB_CHANNEL_CASE"])
    accepted = json.loads((output / "acceptance.json").read_text())
    result = json.loads((output / "result.json").read_text())
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(output / "state"),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": url,
    }
    with (output / "browser-server.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(url + "/api/health", timeout=2) as response:
                        assert json.load(response)["platform"]["ready"]
                    break
                except OSError:
                    time.sleep(0.2)
            else:
                raise TimeoutError("The channel API did not start")
            with sync_playwright() as driver:
                browser = driver.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors, submitted = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on(
                    "request",
                    lambda req: (
                        submitted.append(req.url)
                        if req.method == "POST" and req.url.endswith("/api/jobs")
                        else None
                    ),
                )
                page.goto(url + "/#task=" + accepted["job_id"])
                view = page.get_by_role("region", name="通道分析结果", exact=True)
                expect(view).to_be_visible(timeout=30000)
                expect(view.locator(".channel-summary")).to_contain_text(
                    str(len(result["channels"]))
                )
                capture = view.get_by_role("button", name="生成三维视图图片", exact=True)
                expect(capture).to_be_enabled(timeout=30000)
                expect(
                    view.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                ).to_be_visible()
                page.screenshot(path=output / "native-channel-desktop.png", full_page=True)
                if len(result["channels"]) > 1:
                    button = view.get_by_role("button", name="路径 2", exact=True)
                    button.click()
                    expect(button).to_have_attribute("aria-pressed", "true")
                    expect(capture).to_be_enabled(timeout=30000)
                    expect(view.locator(".channel-summary")).to_contain_text(
                        f"{result['channels'][1]['bottleneck_radius_angstrom']:.2f}"
                    )
                    page.screenshot(path=output / "native-channel-selected.png", full_page=True)
                with page.expect_download() as download:
                    view.get_by_role("link", name="下载三维坐标与半径", exact=True).click()
                download.value.save_as(output / "downloaded-channel-points.csv")
                assert (
                    "sample_polyline_distance_angstrom"
                    in (output / "downloaded-channel-points.csv").read_text()
                )
                with page.expect_download() as download:
                    view.get_by_role("button", name="下载图表", exact=True).click()
                download.value.save_as(output / "downloaded-channel-profile.svg")
                assert "<svg" in (output / "downloaded-channel-profile.svg").read_text()
                capture.click()
                image = page.get_by_role("img", name="当前三维视图图片", exact=True)
                expect(image).to_be_visible(timeout=10000)
                assert image.evaluate("img=>img.complete && img.naturalWidth>0")
                page.screenshot(path=output / "native-channel-capture.png", full_page=True)
                with page.expect_download() as download:
                    page.get_by_role("link", name="下载视图 PNG", exact=True).click()
                download.value.save_as(output / "downloaded-channel-view.png")
                assert (
                    (output / "downloaded-channel-view.png")
                    .read_bytes()
                    .startswith(bytes([137, 80, 78, 71]))
                )
                page.get_by_role("button", name="关闭图片", exact=True).click()
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
                page.screenshot(path=output / "native-channel-mobile.png", full_page=True)
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.get_by_role("navigation", name="主导航").get_by_role(
                    "button", name="口袋与对接", exact=True
                ).click()
                page.get_by_role("combobox", name="研究任务", exact=True).select_option(
                    "caver.paths"
                )
                expect(page.get_by_role("radio", name="上传新文件", exact=True)).to_be_checked()
                expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
                page.get_by_role("button", name="示例结果", exact=True).click()
                expect(page.locator(".module-template .channel-results")).to_be_visible(
                    timeout=30000
                )
                expect(page.locator(".questionnaire:visible")).to_have_count(0)
                page.screenshot(path=output / "fixed-channel-module.png", full_page=True)
                page.get_by_role("button", name="使用此模板", exact=True).click()
                expect(page.get_by_role("button", name="下一步", exact=True)).to_be_enabled()
                for step in range(3):
                    expect(page.locator(".questionnaire>fieldset:visible")).to_have_count(1)
                    if step == 1:
                        expect(
                            page.get_by_role("button", name="移除 A:E20 604", exact=True)
                        ).to_be_visible()
                        page.screenshot(
                            path=output / "channel-site-questionnaire.png", full_page=True
                        )
                    page.get_by_role("button", name="下一步", exact=True).click()
                submit = page.get_by_role("button", name="分析通道与瓶颈", exact=True)
                expect(submit).to_be_enabled()
                page.screenshot(path=output / "channel-review.png", full_page=True)
                assert not submitted
                submit.click()
                expect(page.locator(".channel-results")).to_be_visible(timeout=240000)
                assert len(submitted) == 1 and not errors, errors
                browser.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
