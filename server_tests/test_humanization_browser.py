"""Same-run genuine model result, candidate lineage, compact review and prediction reuse."""

import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

from browser_platform import platform
from playwright.sync_api import expect, sync_playwright


def test_actual_humanization_result_and_questionnaire_version_reuse(tmp_path):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.contracts import VersionInput
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "humanization"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    source = assets.save(
        "actual-variable-regions.fasta", "sequences", (fixture / "input.fasta").read_bytes()
    )
    original = ScientificStore(store, assets).create(
        VersionInput(asset_id=source.id, kind="sequence", label="Actual variable regions"),
        str(uuid4()),
    )
    result = json.loads((fixture / "result.json").read_text())
    result["source"] = original.reference.model_dump(mode="json")
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "antibody_humanize",
            "name": "Actual framework result",
            "sequences": result["source"],
            "scientific_inputs": [result["source"]],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    snapshot = output.parent / "assets"
    snapshot.mkdir()
    shutil.copyfile(fixture / "input.fasta", snapshot / (source.id + source.suffix))
    for row in result["rows"]:
        row.pop("reference", None)
        if row["artifact"]:
            shutil.copyfile(fixture / row["artifact"], output / row["artifact"])
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with platform(state, evidence / "humanization-browser.log") as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base + "/#task=" + job.id)
            scope = page.locator(".humanization-results")
            expect(scope.get_by_role("combobox", name="查看哪条序列？", exact=True)).to_be_visible()
            report = page.request.get(base + f"/api/jobs/{job.id}/result").json()
            index = next(i for i, row in enumerate(report["rows"]) if row["proposal"])
            row = report["rows"][index]
            assert row["reference"]["version_id"]
            scope.get_by_role("combobox", name="查看哪条序列？", exact=True).select_option(
                str(index)
            )
            expect(scope.get_by_role("table", name="同一条序列的参考评估")).to_be_visible()
            expect(
                scope.get_by_role("button", name="用这个候选预测结构", exact=True)
            ).to_be_visible()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                scope.scroll_into_view_if_needed()
                page.screenshot(
                    path=str(evidence / f"humanization-results-{width}.png"), full_page=True
                )
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            scope.get_by_role("button", name="用这个候选预测结构", exact=True).click()
            expect(page.locator(".questionnaire:visible")).to_be_visible()
            assert len(page.request.get(base + "/api/jobs").json()) == 1
            page.get_by_role("navigation", name="主导航").get_by_role(
                "button", name="全部能力", exact=True
            ).click()
            page.get_by_role("button", name="抗体人源参考与框架优化", exact=True).click()
            form = page.locator(".tool-center .questionnaire:visible")
            expect(form.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            form.get_by_role("radio", name="复用研究序列", exact=True).click()
            picker = form.get_by_role("combobox", name="抗体可变域序列 · 研究版本", exact=True)
            expect(
                picker.locator(f'option[value="{row["reference"]["version_id"]}"]')
            ).to_have_count(1)
            picker.select_option(row["reference"]["version_id"])
            form.get_by_role("button", name="下一步", exact=True).click()
            form.get_by_role("button", name="下一步", exact=True).click()
            form.get_by_role("radio", name="生成框架修改建议", exact=True).click()
            form.get_by_role("radio", name="适度探索", exact=True).click()
            form.get_by_role("button", name="上一步", exact=True).click()
            form.get_by_role("radio", name="VHH（探索性评估）", exact=True).click()
            form.get_by_role("button", name="下一步", exact=True).click()
            expect(form.get_by_role("radio", name="只评估，不修改", exact=True)).to_be_checked()
            expect(form.get_by_role("radio", name="生成框架修改建议", exact=True)).to_have_count(0)
            form.get_by_role("button", name="上一步", exact=True).click()
            form.get_by_role("radio", name="常规抗体 VH / VL", exact=True).click()
            form.get_by_role("button", name="下一步", exact=True).click()
            form.get_by_role("radio", name="生成框架修改建议", exact=True).click()
            form.get_by_role("radio", name="适度探索", exact=True).click()
            form.get_by_role("button", name="下一步", exact=True).click()
            expect(form.get_by_text("最多修改 5 处，2 轮", exact=True)).to_be_visible()
            expect(form.get_by_role("button", name="生成框架建议", exact=True)).to_be_disabled()
            assert len(page.request.get(base + "/api/jobs").json()) == 1
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                page.screenshot(
                    path=str(evidence / f"humanization-review-{width}.png"), full_page=True
                )
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors
        finally:
            browser.close()
