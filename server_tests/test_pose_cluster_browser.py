"""A real public-pose questionnaire executes the accepted native method and displays it."""

import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_real_pose_clustering_questionnaire_preview_and_download():
    output = Path(os.environ["WB_POSE_CLUSTER"])
    accepted = json.loads((output / "acceptance.json").read_text())
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(output / "state"),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": url,
        "WB_CHEMISTRY_IMAGE": accepted["chemistry_image"],
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
        env=env,
        stdout=(output / "browser-server.log").open("w"),
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
            raise TimeoutError("Native clustering API did not start")
        with sync_playwright() as driver:
            browser = driver.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            try:
                page.goto(url + "/#task=" + accepted["job_id"])
                result = page.get_by_role("region", name="结合模式分群结果", exact=True)
                expect(result).to_be_visible()
                expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                    timeout=30000
                )
                expect(
                    page.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                ).to_be_visible()
                page.screenshot(path=output / "native-clusters-desktop.png", full_page=True)
                result.get_by_role("tab", name="二维结构", exact=True).click()
                image = result.get_by_role("img", name=re.compile("^二维分子结构 · 姿势"))
                expect(image).to_be_visible(timeout=30000)
                assert image.evaluate("img=>img.complete && img.naturalWidth>0")
                result.get_by_role("tab", name="三维结构", exact=True).click()
                native = json.loads((output / "result.json").read_text())
                distance = native["pairs"][0]["rmsd_angstrom"]
                expected_label = "姿势 1 / 2 · " + (
                    "未知" if distance is None else f"{distance:.3f} Å"
                )
                pair = result.get_by_role("button", name=expected_label, exact=True)
                pair.click()
                metrics = result.locator(".cluster-preview > p")
                expect(metrics).to_be_visible()
                expect(metrics).to_contain_text(
                    "三维差异 " + ("—" if distance is None else f"{distance:.3f} Å")
                )
                similarity = native["pairs"][0]["contact_jaccard"]
                expect(metrics).to_contain_text(
                    "接触相似度 " + ("—" if similarity is None else f"{similarity * 100:.1f}%")
                )
                page.screenshot(path=output / "native-pair-overlay.png", full_page=True)
                with page.expect_download() as downloaded:
                    result.get_by_role("link", name="下载两两比较", exact=True).click()
                downloaded.value.save_as(output / "downloaded-pairs.csv")
                assert "rmsd_angstrom" in (output / "downloaded-pairs.csv").read_text()
                with page.expect_download() as downloaded:
                    result.get_by_role("button", name="下载比较图", exact=True).click()
                downloaded.value.save_as(output / "comparison-map.svg")
                assert "<svg" in (output / "comparison-map.svg").read_text()
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
                page.screenshot(path=output / "native-clusters-mobile.png", full_page=True)
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.get_by_role("navigation", name="主导航").get_by_role(
                    "button", name="口袋与对接", exact=True
                ).click()
                page.get_by_role("combobox", name="研究任务", exact=True).select_option(
                    "pose_exploration"
                )
                page.get_by_text("历史探索计划", exact=True).click()
                page.get_by_role("combobox", name="选择历史计划", exact=True).select_option(
                    accepted["exploration_id"]
                )
                page.get_by_role("combobox", name="已保存姿势集合", exact=True).select_option(
                    accepted["pose_set_id"]
                )
                page.get_by_role("button", name="按结合模式分群", exact=True).click()
                form = page.locator(".pose-results form.questionnaire")
                expect(form.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
                form.get_by_role("button", name="全选", exact=True).click()
                for _ in range(3):
                    form.get_by_role("button", name="下一步", exact=True).click()
                form.get_by_role("textbox", name="分析名称", exact=True).fill(
                    "BRD4–JQ1 分群 · 浏览器验收"
                )
                with page.expect_response(
                    lambda r: r.request.method == "POST" and r.url.endswith("/api/jobs")
                ) as posted:
                    form.get_by_role("button", name="开始分群", exact=True).click()
                assert posted.value.status == 201, posted.value.text()
                created = posted.value.json()
                form.get_by_role("link", name="查看任务进度与结果", exact=True).click()
                expect(
                    page.get_by_role("region", name="结合模式分群结果", exact=True)
                ).to_be_visible(timeout=90000)
                page.screenshot(path=output / "fresh-clustering-result.png", full_page=True)
                assert created["request"]["operation"] == "pose_cluster"
                assert not errors, errors
            except Exception:
                page.screenshot(path=output / "failed-browser-page.png", full_page=True)
                (output / "failed-browser-dom.txt").write_text(
                    page.locator("body").inner_text(), encoding="utf-8"
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
