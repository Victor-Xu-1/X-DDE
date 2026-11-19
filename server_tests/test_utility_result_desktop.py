"""Replay a real native utility result at the browser's submission boundary."""

import json
import os
import shutil
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform

JOB = "5c35e148-cb26-4e46-b5ab-2231e228ccea"


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1280, 800),
    ("zh", 1600, 900),
])
def test_utility_uses_the_workspace_for_the_accepted_result(
    tmp_path, monkeypatch, language, width, height,
):
    zh = language == "zh"
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    settings = Settings.from_env()
    restore_bundle(Path(os.environ["WB_RETAINED_UTILITY"]), settings, SHA256)
    shutil.copyfile(
        os.environ["WB_UTILITY_GRAPHICS"], settings.state_dir / "deployment.json",
    )
    evidence = Path("outputs/utility-result-desktop") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "server.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        job = page.request.get(f"{base}/api/jobs/{JOB}").json()
        asset_id = job["request"]["ligand_files"][0]
        source = page.request.get(f"{base}/api/assets/{asset_id}/metadata").json()
        actual = page.request.get(f"{base}/api/jobs/{JOB}/result").json()
        assert job["status"] == "succeeded" and len(actual["molecules"]) > 1
        writes, submissions = [], []

        def replay(route):
            req = route.request
            if req.method in {"GET", "HEAD"}:
                if req.url == f"{base}/api/capabilities/properties":
                    response = route.fetch()
                    body = response.json()
                    body["availability"]["configuration_present"] = True
                    route.fulfill(response=response, json=body)
                else:
                    route.continue_()
                return
            if req.method == "POST" and req.url == f"{base}/api/jobs":
                submissions.append(req.post_data_json)
                route.fulfill(status=201, json=job)
                return
            writes.append(req.url)
            route.abort()

        page.route("**/api/**", replay)
        power = f"{base}/api/runtime-controls?include_native=false"
        before = page.request.get(power).json()
        page.goto(f"{base}/#view=utilities")
        strip = page.locator(".utility-tabs")
        properties = "分子性质" if zh else "Molecular properties"
        strip.get_by_role("button", name=properties, exact=True).click()
        tool = page.locator('.utility-panel[data-utility="properties"]')
        tool.get_by_role("radio", name="历史文件" if zh else "Historical files").check()
        search = "查找历史材料" if zh else "Find historical inputs"
        tool.get_by_role("searchbox", name=search).fill(source["name"])
        file = tool.locator(".asset-picker select")
        expect(file.locator(f'option[value="{asset_id}"]')).to_have_count(1)
        file.select_option(asset_id)
        run = tool.get_by_role("button", name="计算性质" if zh else "Calculate properties")
        expect(run).to_be_enabled(timeout=12000)
        run.click()
        result = tool.get_by_role("region", name="本次结果" if zh else "Current results")
        heading = result.get_by_role("heading", name="结果" if zh else "Results", exact=True)
        expect(heading).to_be_focused()
        assert heading.bounding_box()["y"] <= 160
        assert strip.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        download = "任务详情与下载" if zh else "Task details & downloads"
        link = result.get_by_role("link", name=download)
        expect(link).to_have_attribute("href", f"/#task={JOB}")
        expect(run).to_have_count(0)
        canvas = result.locator(".structure-workbench-view .molecule-image img").first
        expect(canvas).to_be_visible(timeout=35000)
        assert canvas.bounding_box()["y"] < height * 0.6
        assert canvas.evaluate(
            "node => getComputedStyle(node.closest('.molecule-image')).borderRadius"
        ) == "10px"
        result.get_by_role("tab", name="记录与导出" if zh else "Records & export").click()
        expect(result.locator(".properties-results .research-table tbody tr")).to_have_count(
            len(actual["molecules"])
        )
        page.screenshot(path=evidence / "result-workspace.png")

        inputs = tool.get_by_role("region", name="任务输入" if zh else "Task inputs")
        result.get_by_role("button", name="编辑输入" if zh else "Edit inputs").press("Enter")
        expect(inputs).to_be_focused()
        expect(file).to_have_value(asset_id)
        paste = "粘贴截图" if zh else "Paste screenshot"
        expect(tool.get_by_role("button", name=paste)).to_be_visible()
        reopen_name = "查看本次结果" if zh else "View current results"
        reopen = tool.get_by_role("button", name=reopen_name)
        reopen.press("Enter")
        expect(heading).to_be_focused()
        strip.get_by_role("button", name="ADMET 预测" if zh else "ADMET prediction").click()
        strip.get_by_role("button", name=properties, exact=True).click()
        expect(result).to_be_visible()
        result.get_by_role("button", name="编辑输入" if zh else "Edit inputs").click()
        tool.get_by_role(
            "radio", name=(
                "粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)"
            ),
        ).check()
        tool.get_by_role("textbox", name="SMILES", exact=True).fill("c1ccccc1")
        expect(reopen).to_have_count(0)
        expect(result).to_have_count(0)
        tool.get_by_role("button", name="新建任务" if zh else "New task").click()
        expect(inputs).to_be_focused()
        assert not writes and len(submissions) == 1
        assert submissions[0]["operation"] == "properties"
        assert submissions[0]["ligand_files"] == [asset_id] and not submissions[0]["smiles"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert page.request.get(power).json() == before
        (evidence / "receipt.json").write_text(json.dumps({
            "job": JOB, "asset_sha256": source["sha256"], "replayed_requests": len(submissions),
            "backend_writes": writes,
        }, indent=2), encoding="utf-8")
        browser.close()
