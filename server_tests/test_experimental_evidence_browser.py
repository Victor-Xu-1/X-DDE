"""The real installed source and API drive a one-question-per-page browser journey."""

import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


def test_reported_evidence_example_and_fresh_questionnaire():
    output = Path(os.environ["WB_EXPERIMENTAL_EVIDENCE"])
    receipt = json.loads((output / "acceptance.json").read_text())
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {
        **os.environ,
        "WB_AUTO_DEPLOY": "0",
        "WB_STATE_DIR": str(output / "state"),
        "WB_ALLOWED_ORIGINS": f"http://127.0.0.1:{port}",
    }
    process = subprocess.Popen(
        [
            "uv",
            "run",
            "--locked",
            "uvicorn",
            "opendde_workbench.api:create_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        env=env,
        stdout=(output / "browser-server.log").open("w"),
        stderr=subprocess.STDOUT,
    )
    url = f"http://127.0.0.1:{port}"
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
            raise TimeoutError("The accepted evidence API did not start.")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            diagnostics = []
            page.on(
                "console", lambda message: diagnostics.append(message.type + ": " + message.text)
            )
            page.on("pageerror", lambda error: diagnostics.append("pageerror: " + str(error)))
            try:
                page.goto(url)
                page.get_by_role("button", name="性质与安全性", exact=True).click()
                page.get_by_role("combobox", name="研究任务", exact=True).select_option(
                    "experimental.evidence"
                )
                page.get_by_role("heading", name="1. 上传实验表格", exact=True).wait_for()
                assert page.get_by_role("button", name="下一步", exact=True).is_disabled()
                assert (
                    page.get_by_role("group", name="后端模型")
                    .get_by_role("button", pressed=True)
                    .count()
                    == 1
                )
                page.screenshot(path=output / "fresh-task-desktop.png")
                page.get_by_role("button", name="示例结果", exact=True).click()
                page.get_by_role("region", name="实验数据结果").wait_for()
                page.get_by_role("table", name="原始实测记录").wait_for()
                assert "177" in page.get_by_role("region", name="实验数据结果").inner_text()
                assert page.get_by_role("img", name="同条件实测值对比图").count() == 1
                molecule = page.get_by_role("img", name="二维分子结构 · CHEMBL126384", exact=True)
                molecule.wait_for(timeout=30000)
                assert molecule.evaluate("img => img.complete && img.naturalWidth > 0")
                page.screenshot(path=output / "reported-results-desktop.png", full_page=True)
                with page.expect_download() as download:
                    page.get_by_role("link", name="下载实测表格", exact=True).click()
                download.value.save_as(output / "downloaded-observations.csv")
                assert (
                    len(
                        (output / "downloaded-observations.csv")
                        .read_text(encoding="utf-8-sig")
                        .splitlines()
                    )
                    == 178
                )
                page.set_viewport_size({"width": 390, "height": 844})
                page.screenshot(path=output / "reported-results-mobile.png", full_page=True)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                page.get_by_role("button", name="新建空白任务", exact=True).click()
                page.get_by_role("heading", name="1. 上传实验表格", exact=True).wait_for()
                assert page.get_by_role("button", name="下一步", exact=True).is_disabled()
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.get_by_label("上传 实验 CSV 表格", exact=True).set_input_files(
                    output / "experimental-input.csv"
                )
                page.get_by_role("combobox", name="化合物/材料编号", exact=True).select_option(
                    "compound_id"
                )
                page.get_by_role("combobox", name="实测值", exact=True).select_option("value")
                page.get_by_role("button", name="下一步", exact=True).click()
                page.get_by_role("combobox", name="实测终点", exact=True).select_option("IC50")
                page.get_by_role("textbox", name="靶点或研究表型", exact=True).fill(
                    "CHEMBL203 / human EGFR"
                )
                page.get_by_role("textbox", name="实验名称或编号", exact=True).fill("CHEMBL944276")
                page.get_by_role(
                    "textbox", name="数据来源（报告、实验记录或文献）", exact=True
                ).fill("ChEMBL CHEMBL944276 / CC-BY-SA-3.0; published within-assay medians")
                page.get_by_role("button", name="下一步", exact=True).click()
                page.get_by_role("button", name="检查全部记录", exact=True).click()
                page.get_by_role("table", name="实验记录预览", exact=True).wait_for()
                page.get_by_role("button", name="下一步", exact=True).click()
                page.get_by_role("textbox", name="研究记录名称", exact=True).fill(
                    "EGFR 实验导入 · 浏览器验收"
                )
                page.get_by_role("button", name="保存实验记录", exact=True).click()
                page.get_by_role("region", name="实验数据结果", exact=True).wait_for()
                page.screenshot(path=output / "fresh-import-result.png", full_page=True)
            except Exception:
                page.screenshot(path=output / "failed-browser-page.png", full_page=True)
                (output / "failed-browser-dom.txt").write_text(
                    page.locator("body").inner_text(), encoding="utf-8"
                )
                raise
            finally:
                (output / "browser-console.txt").write_text(
                    "\n".join(diagnostics), encoding="utf-8"
                )
            browser.close()
        assert receipt["reported_observations"] == 177
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
