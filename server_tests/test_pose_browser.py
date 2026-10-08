"""Real native pose assets through guided planning, previews and paired receptor handoff."""

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


def test_actual_pose_ensemble_guided_plan_preview_and_version_reuse(tmp_path):
    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "pose-ensemble"
    state = tmp_path / "state"
    shutil.copytree(fixture, state)
    accepted = json.loads((fixture / "acceptance.json").read_text())
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
    with (evidence / "pose-ensemble-browser.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(40):
                try:
                    with urlopen(base + "/api/health", timeout=2) as r:
                        assert json.load(r)["worker_ready"]
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise AssertionError("Pose fixture service did not become ready")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base)
                    page.get_by_role("navigation", name="主导航", exact=True).get_by_role(
                        "button", name="全部能力", exact=True
                    ).click()
                    page.get_by_role("button", name="多受体与状态姿势探索", exact=True).click()
                    workspace = page.get_by_role("region", name="多受体与状态姿势探索", exact=True)
                    before = len(page.request.get(base + "/api/jobs").json())
                    workspace.get_by_role(
                        "combobox", name="使用哪个位点集合？", exact=True
                    ).select_option(accepted["site_set_id"])
                    group = workspace.get_by_role("group", name="探索哪些位点？", exact=True)
                    group.get_by_role("checkbox", name="受体 1 · 口袋 1", exact=True).check()
                    group.get_by_role("checkbox", name="受体 2 · 口袋 1", exact=True).check()
                    workspace.get_by_role("button", name="下一步", exact=True).click()
                    workspace.get_by_role("combobox", name="分子来源", exact=True).select_option(
                        "states"
                    )
                    workspace.get_by_role(
                        "combobox", name="分子状态集合", exact=True
                    ).select_option(accepted["state_set_id"])
                    workspace.get_by_role("combobox", name="初始构象", exact=True).select_option(
                        "0"
                    )
                    workspace.get_by_role("button", name="下一步", exact=True).click()
                    plans_before_review = len(
                        page.request.get(base + "/api/research/pose-explorations").json()
                    )
                    workspace.get_by_role("button", name="下一步", exact=True).click()
                    assert (
                        len(page.request.get(base + "/api/research/pose-explorations").json())
                        == plans_before_review
                    )
                    page.screenshot(
                        path="server_tests/evidence/pose-plan-before-save.png", full_page=True
                    )
                    assert (
                        workspace.locator(".questionnaire-heading").inner_text() == "4. 确认保存"
                    ), workspace.locator(".questionnaire").inner_text()
                    with page.expect_response(
                        lambda r: (
                            r.url.endswith("/api/research/pose-explorations")
                            and r.request.method == "POST"
                        )
                    ) as created:
                        workspace.get_by_role(
                            "button", name="保存并审阅探索计划", exact=True
                        ).click()
                    assert created.value.status == 201, created.value.text()
                    assert len(created.value.json()["combinations"]) == 2
                    expect(
                        workspace.get_by_role("button", name="启动已审阅的姿势探索", exact=True)
                    ).to_be_disabled()
                    assert len(page.request.get(base + "/api/jobs").json()) == before
                    workspace.get_by_role(
                        "combobox", name="复用已保存探索计划", exact=True
                    ).select_option(accepted["exploration_id"])
                    workspace.get_by_role(
                        "combobox", name="已保存姿势集合", exact=True
                    ).select_option(accepted["pose_set_id"])
                    result = workspace.get_by_role("region", name="多假设姿势集合", exact=True)
                    expect(result).to_be_visible()
                    saved = page.request.get(
                        base + "/api/research/pose-ensembles/" + accepted["pose_set_id"]
                    ).json()
                    result.get_by_role("combobox", name="查看哪个组合？", exact=True).select_option(
                        "7"
                    )
                    outcome = saved["outcomes"][7]
                    reference = next(p["reference"] for p in outcome["poses"] if p["reference"])
                    result.get_by_role("button", name="姿势 1", exact=True).click()
                    expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                        timeout=30000
                    )
                    expect(
                        page.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                    ).to_be_visible(timeout=30000)
                    expect(result.get_by_text("经验对接分数:", exact=False).first).to_be_visible()
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth+1"
                        )
                        result.scroll_into_view_if_needed()
                        page.screenshot(path=str(evidence / f"pose-ensemble-{width}.png"))
                    result.get_by_role("button", name="计算此姿势分子性质", exact=True).click()
                    page.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        page.get_by_role("combobox", name="分子文件（可含多个记录）", exact=True)
                    ).to_have_value(reference["asset_id"])
                    page.get_by_role("button", name="← 返回结果", exact=True).click()
                    result.get_by_role("button", name="在配套受体上重新评分", exact=True).click()
                    expect(
                        page.get_by_role("combobox", name="受体结构 · 复用研究资产", exact=True)
                    ).to_have_value(outcome["combination"]["receptor"]["version_id"])
                    expect(
                        page.get_by_role(
                            "combobox", name="选择分子或已有姿势 · 复用研究资产", exact=True
                        )
                    ).to_have_value(reference["version_id"])
                    page.screenshot(
                        path=str(evidence / "pose-paired-rescore-handoff-390.png"), full_page=True
                    )
                    page.get_by_role("button", name="← 返回结果", exact=True).click()
                    result.get_by_text("比较原生评分", exact=True).click()
                    result.get_by_role("combobox", name="比较哪些姿势？", exact=True).select_option(
                        "all"
                    )
                    with page.expect_response(
                        lambda r: (
                            r.url.endswith("/api/research/pose-score-comparisons")
                            and r.request.method == "POST"
                        )
                    ) as comparison_created:
                        result.get_by_role("button", name="比较并保存证据", exact=True).click()
                    assert comparison_created.value.status == 201, comparison_created.value.text()
                    compared = comparison_created.value.json()
                    assert len(compared["groups"]) == 2
                    view = result.get_by_role("region", name="同条件评分比较", exact=True)
                    expect(view).to_be_visible()
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth+1"
                        )
                        view.scroll_into_view_if_needed()
                        page.screenshot(path=str(evidence / f"pose-score-comparison-{width}.png"))
                    first = min(compared["groups"][0]["poses"], key=lambda p: p["front"])
                    view.get_by_role("button").first.click()
                    chosen = next(
                        i
                        for i, o in enumerate(saved["outcomes"])
                        if o["combination"]["step_id"] == first["selection"]["step_id"]
                    )
                    expect(
                        result.get_by_role("combobox", name="查看哪个组合？", exact=True)
                    ).to_have_value(str(chosen))
                    assert len(page.request.get(base + "/api/jobs").json()) == before and not errors
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)
