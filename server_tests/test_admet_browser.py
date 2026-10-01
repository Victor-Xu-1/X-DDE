"""Chromium consumes this exact run's real ADMET output, source bytes and native previews."""

import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


def restore_fixture(fixture, state):
    from opendde_workbench.admet.result import validate_admet
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.contracts import VersionInput
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.store import Store

    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    report = json.loads((fixture / "result.json").read_text())
    source = assets.save(
        "Original ADMET candidate file.sdf", "ligand", (fixture / "source.sdf").read_bytes()
    )
    report["source"] = {"asset_id": source.id, "sha256": source.sha256}
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "admet_predict",
            "name": "Actual native predictions",
            "library": report["source"],
            "options": report["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    directory = state / "jobs" / job.id
    directory.mkdir(parents=True)
    assets.snapshot(request, directory)
    output = directory / "output"
    output.mkdir()
    for filename in ["predictions.csv", *report["previews_sha256"]]:
        shutil.copyfile(fixture / filename, output / filename)
    (output / "result.json").write_text(json.dumps(report))
    validate_admet(report, request, output)
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    version = ScientificStore(store, assets).create_many(
        [
            (
                VersionInput(
                    asset_id=source.id, kind="molecule", record=3, label="Original aspirin"
                ),
                "original-aspirin",
            )
        ]
    )[0]
    return job, source, version


def screenshot(page, evidence, name):
    for width in (1440, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        if name == "results":
            results = page.locator(".operation-results")
            artifacts = page.locator(".detail-panel > .artifacts")
            result_box, artifact_box = results.bounding_box(), artifacts.bounding_box()
            assert result_box and artifact_box
            assert artifact_box["y"] >= result_box["y"] + result_box["height"] - 1
            stage = page.locator(".admet-selected-record .molecular-stage").bounding_box()
            assert stage and 250 <= stage["height"] <= 410
        page.screenshot(path=str(evidence / f"admet-{name}-{width}.png"), full_page=True)
    page.set_viewport_size({"width": 1440, "height": 1000})


def test_actual_predictions_preview_original_record_reuse_and_single_question_flow(tmp_path):
    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "admet"
    state = tmp_path / "state"
    job, source, version = restore_fixture(fixture, state)
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with platform(state, evidence / "admet-browser.log") as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script("""
            window.addEventListener('message', event => {
                    const frame = document.querySelector('.admet-selected-record iframe');
                if (event.origin === location.origin &&
                        event.source === frame?.contentWindow &&
                    event.data?.channel === 'opendde-viewer' &&
                    event.data.type === 'loaded')
                        document.documentElement.dataset.admetViewerAtoms =
                            String(event.data.detail.atoms);
            });
        """)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base + "/#task=" + job.id)
            results = page.get_by_role("region", name="性质与早期安全性预测结果", exact=True)
            expect(results).to_be_visible()
            expect(results.get_by_role("status")).to_have_text("已预测 3 / 5")
            expect(results.get_by_role("heading", name="#2 · =1+1", exact=True)).to_be_visible()
            expect(page.locator("iframe").first).to_be_visible()
            expect(page.locator("html")).to_have_attribute("data-admet-viewer-atoms", "3")
            report = page.request.get(base + f"/api/jobs/{job.id}/result").json()
            assert report["rows"][1]["reference"]["record"] == 1
            assert report["rows"][1]["reference"]["sha256"] == source.sha256
            assert report["rows"][0]["predictions"] == {}
            assert report["rows"][2]["duplicate_of_record"] == 1
            assert len(report["endpoints"]) == 41
            screenshot(page, evidence, "results")
            results.get_by_role("button", name="#1 ·", exact=False).click()
            expect(results.locator("iframe")).to_have_count(0)
            expect(results.get_by_role("button", name="复用原始分子 → 分子准备")).to_have_count(0)
            results.get_by_role("button", name="#4 · Aspirin", exact=False).click()
            expect(results.get_by_role("heading", name="#4 · Aspirin", exact=True)).to_be_visible()
            expect(results.locator("iframe")).to_be_visible()
            expect(page.locator("html")).to_have_attribute("data-admet-viewer-atoms", "13")
            results.get_by_role("checkbox", name="显示全部终点", exact=True).check()
            endpoint_region = results.get_by_role("region", name="性质预测", exact=True)
            expect(endpoint_region.locator("table").first.locator("tbody tr")).to_have_count(41)
            results.get_by_role("combobox", name="结果分组", exact=True).select_option("Toxicity")
            toxicity = sum(e["category"] == "Toxicity" for e in report["endpoints"])
            expect(endpoint_region.locator("table").first.locator("tbody tr")).to_have_count(
                toxicity
            )
            csv = page.request.get(base + f"/api/jobs/{job.id}/download?name=predictions.csv")
            assert csv.ok and "'=1+1" in csv.text()
            # Reuse the original fourth record, never a reindexed row or a diagnostic copy.
            results.get_by_role("button", name="复用原始分子 → 分子准备", exact=True).click()
            panel = page.locator(".questionnaire:visible")
            expect(
                panel.get_by_role("spinbutton", name="SDF 中第几个分子（从 1 开始）")
            ).to_have_value("4")
            expect(
                panel.get_by_role("combobox", name="选择 SDF 分子版本", exact=True)
            ).to_have_value(source.id)
            panel.get_by_role("button", name="下一步", exact=True).click()
            panel.get_by_role("button", name="上一步", exact=True).click()
            expect(
                panel.get_by_role("spinbutton", name="SDF 中第几个分子（从 1 开始）")
            ).to_have_value("4")
            assert len(page.request.get(base + "/api/jobs").json()) == 1
            page.get_by_role("navigation", name="主导航").get_by_role(
                "button", name="全部能力", exact=True
            ).click()
            page.get_by_role("button", name="性质与早期安全性预测", exact=True).click()
            panel = page.locator(".questionnaire:visible")
            expect(panel.locator("> fieldset:not([hidden])")).to_have_count(1)
            panel.get_by_role("button", name="下一步", exact=True).click()
            expect(panel.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            picker = panel.get_by_role("combobox", name="选择分子版本 · 复用研究资产", exact=True)
            picker.select_option(str(version.id))
            panel.get_by_role("button", name="下一步", exact=True).click()
            panel.get_by_role("radio", name="早期安全性", exact=True).click()
            panel.get_by_role("button", name="下一步", exact=True).click()
            expect(
                panel.get_by_text("Original ADMET candidate file.sdf · #4", exact=True)
            ).to_be_visible()
            expect(panel.get_by_role("button", name="开始性质预测", exact=True)).to_be_disabled()
            assert len(page.request.get(base + "/api/jobs").json()) == 1
            screenshot(page, evidence, "review")
            panel.get_by_role("button", name="上一步", exact=True).click()
            expect(panel.get_by_role("radio", name="早期安全性", exact=True)).to_be_checked()
            panel.get_by_role("button", name="上一步", exact=True).click()
            expect(picker).to_have_value(str(version.id))
            panel.get_by_role("button", name="上一步", exact=True).click()
            panel.get_by_role("radio", name="一组候选分子", exact=True).click()
            panel.get_by_role("button", name="下一步", exact=True).click()
            expect(panel.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            panel.get_by_role("combobox", name="候选分子 SDF 文件", exact=True).select_option(
                source.id
            )
            panel.get_by_role("button", name="下一步", exact=True).click()
            panel.get_by_role("button", name="下一步", exact=True).click()
            expect(
                panel.get_by_text("Original ADMET candidate file.sdf · 全部记录", exact=True)
            ).to_be_visible()
            assert len(page.request.get(base + "/api/jobs").json()) == 1
            page.reload()
            expect(page.get_by_role("navigation", name="主导航")).to_be_visible()
            assert (
                page.request.get(base + "/api/assets/" + source.id).body()
                == (fixture / "source.sdf").read_bytes()
            )
            assert not errors
        finally:
            browser.close()
