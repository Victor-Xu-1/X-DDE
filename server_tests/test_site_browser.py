"""Use unchanged same-run native structures, CSV and SQLite snapshots in real Chromium."""

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def test_real_site_choices_saved_evidence_and_exact_downstream_version(tmp_path):
    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "site-association"
    state = tmp_path / "state"
    shutil.copytree(fixture, state)
    acceptance = json.loads((fixture / "acceptance.json").read_text())
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with (evidence / "site-browser.log").open("w") as log:
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
                raise AssertionError("Site browser service did not become ready")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base + "/#task=" + acceptance["alignment_job"])
                    page.get_by_text("比较各构象的口袋", exact=True).click()
                    workspace = page.get_by_role("region", name="跨构象口袋关联", exact=True)
                    expect(
                        workspace.get_by_text("读取可复用口袋任务…", exact=True)
                    ).not_to_be_visible()
                    for index, identifier in enumerate(acceptance["source_jobs"]):
                        workspace.get_by_role(
                            "combobox", name=f"受体 {index + 1} · 口袋任务", exact=True
                        ).select_option(identifier)
                    workspace.get_by_role("combobox", name="关联方式", exact=True).select_option(
                        "strict"
                    )
                    workspace.get_by_role("button", name="专家阈值", exact=True).click()
                    expect(
                        workspace.get_by_role(
                            "spinbutton", name="口袋中心最大距离（Å）", exact=True
                        )
                    ).to_have_value("5")
                    workspace.get_by_role("button", name="返回选择模式", exact=True).click()
                    workspace.get_by_role("combobox", name="关联方式", exact=True).select_option(
                        "balanced"
                    )
                    with page.expect_response(
                        lambda r: (
                            r.url.endswith("/api/research/site-sets") and r.request.method == "POST"
                        )
                    ) as created:
                        workspace.get_by_role(
                            "button", name="比较并保存位点集合", exact=True
                        ).click()
                    assert created.value.status == 201
                    record = created.value.json()
                    expect(
                        workspace.get_by_role("region", name="跨构象位点结果", exact=True)
                    ).to_be_visible()
                    workspace.get_by_text("关联证据与阈值", exact=True).click()
                    expect(workspace.locator("table tbody tr").first).to_be_visible()
                    workspace.get_by_role("button", name="残基重叠率说明", exact=True).click()
                    expect(page.get_by_role("tooltip")).to_contain_text("不代表亲和力")
                    page.keyboard.press("Escape")
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth+1"
                        )
                        if width == 390:
                            assert workspace.locator("table").evaluate(
                                "e => e.scrollWidth > e.parentElement.clientWidth"
                            )
                            expect(
                                workspace.get_by_role("columnheader", name="残基重叠率", exact=True)
                            ).to_be_visible()
                        page.screenshot(
                            path=str(evidence / f"site-association-{width}.png"), full_page=True
                        )
                        workspace.locator(".site-table-wrap").scroll_into_view_if_needed()
                        page.screenshot(path=str(evidence / f"site-evidence-viewport-{width}.png"))
                    choice = workspace.get_by_role(
                        "button", name="受体 2 · 口袋 1 · 查看并复用", exact=True
                    )
                    expect(choice).to_be_visible()
                    choice.click()
                    workspace.get_by_role(
                        "button", name="探索这个口袋的结合模式", exact=True
                    ).click()
                    expected_ref = next(
                        o["protein"] for o in record["observations"] if o["member_index"] == 1
                    )
                    selector = workspace.get_by_role(
                        "combobox", name="受体结构 · 复用研究资产", exact=True
                    )
                    expect(selector).to_have_value(expected_ref["version_id"])
                    page.screenshot(
                        path=str(evidence / "site-docking-handoff-390.png"), full_page=True
                    )
                    assert len(page.request.get(base + "/api/jobs").json()) == 3
                    page.reload()
                    page.get_by_text("比较各构象的口袋", exact=True).click()
                    workspace = page.get_by_role("region", name="跨构象口袋关联", exact=True)
                    workspace.get_by_role(
                        "combobox", name="已保存的位点集合", exact=True
                    ).select_option(record["id"])
                    expect(
                        workspace.get_by_role("region", name="跨构象位点结果", exact=True)
                    ).to_be_visible()
                    page.get_by_role("button", name="研究资产", exact=True).click()
                    page.get_by_role("searchbox", name="查找资产或任务", exact=True).fill(
                        record["request"]["name"]
                    )
                    page.locator(".research-node-list").get_by_role("button").filter(
                        has_text=record["request"]["name"]
                    ).click()
                    graph = page.get_by_role("group", name="科学资产关系图", exact=True)
                    graph.get_by_role(
                        "button", name="跨构象位点: " + record["request"]["name"], exact=True
                    ).click()
                    page.get_by_role("button", name="查看任务与结果", exact=True).click()
                    expect(
                        page.get_by_role("region", name="受体构象集合结果", exact=True)
                    ).to_be_visible()
                    assert not errors
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)
