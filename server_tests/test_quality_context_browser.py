"""Read real retained STAT6 quality results; never create or repair a molecule."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

QUALITY_JOB = "8969b071-879b-4374-9044-f9108ba29588"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_retained_stat6_report_distinguishes_assessed_from_missing_context(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.get(QUALITY_JOB)
    assert job and job.status == "succeeded" and job.request.operation == "pose_quality"
    output = settings.state_dir / "jobs" / job.id / "output"
    report_path = output / "result.json"
    result = json.loads(report_path.read_text())
    assert result["options"]["profile"] == "dock" and result["classification"] == "passes"
    assert len(result["checks"]) == 22 and all(c["outcome"] == "pass" for c in result["checks"])
    protein = output / "protein-preview.pdb"
    assert not any(line.startswith("HETATM") for line in protein.read_text().splitlines())
    components = ("waters", "organic_cofactors", "inorganic_cofactors")
    for component in components:
        assert "smallest_distance_" + component not in result["metrics"]
        assert "volume_overlap_" + component not in result["metrics"]
    files = [report_path, protein, output / "molecule-preview.sdf"]
    before_files = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    before_jobs = {row.id: row.status for row in store.list_jobs(1000)}
    evidence = Path("outputs/quality-context") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/#task=" + QUALITY_JOB)
        panel = page.get_by_role(
            "region", name="构象与姿势质控结果" if zh else "Pose quality results"
        )
        expect(panel).to_be_visible(timeout=30000)
        measurement = panel.get_by_role("region", name="姿势测量" if zh else "Pose measurements")
        expect(
            measurement.get_by_text(
                f"{result['metrics']['smallest_distance_protein']:.2f} Å", exact=True
            )
        ).to_be_visible()
        expect(
            panel.get_by_role(
                "button", name="受体内最小化" if zh else "Minimize in receptor", exact=True
            )
        ).to_have_count(0)
        table = panel.get_by_role("table", name="质控检查结果" if zh else "Quality check outcomes")
        (evidence / "native-source.json").write_text(
            json.dumps(
                {
                    "source_job": job.id,
                    "native_checks": result["checks"],
                    "native_metrics": result["metrics"],
                    "original_files": before_files,
                },
                indent=2,
            )
        )
        page.screenshot(path=evidence / "native-before-assessment.png", full_page=True)
        water = table.get_by_role("row").filter(
            has=page.get_by_text(
                "与结构水无明显距离冲突" if zh else "Water distance clash", exact=True
            )
        )
        expect(water.get_by_text("未评估" if zh else "Not assessed", exact=True)).to_be_visible()
        expect(
            panel.get_by_text(
                "已通过全部适用检查" if zh else "All applicable checks passed", exact=False
            )
        ).to_have_count(0)
        summary = panel.get_by_role(
            "status", name="质控评估摘要" if zh else "Quality assessment summary"
        )
        for text in (
            ["通过: 15", "未评估: 6", "不适用: 1"]
            if zh
            else ["Pass: 15", "Not assessed: 6", "Not applicable: 1"]
        ):
            expect(summary.get_by_text(text, exact=True)).to_be_visible()
        disclosure = panel.locator(".quality-method-details")
        expect(disclosure).not_to_have_attribute("open", "")
        disclosure.locator("summary").click()
        expect(
            disclosure.get_by_text(
                "原始报告：22 项通过" if zh else "Source report: 22 passed", exact=False
            )
        ).to_be_visible()
        disclosure.locator("summary").click()
        selector = panel.get_by_role("combobox", name="显示哪些检查？" if zh else "Which checks?")
        selector.select_option("not_applicable")
        expect(table.get_by_role("row")).to_have_count(2)
        expect(table.get_by_text("不适用" if zh else "Not applicable", exact=True)).to_have_count(1)
        selector.select_option("unassessed")
        expect(table.get_by_role("row")).to_have_count(7)
        expect(table.get_by_text("未评估" if zh else "Not assessed", exact=True)).to_have_count(6)
        expect(
            panel.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
            )
        ).to_be_enabled(timeout=30000)
        preview = panel.locator(".structure-workbench-view").bounding_box()
        details = panel.locator(".structure-workbench-details").bounding_box()
        assert preview and details
        if width > 1000:
            assert preview["x"] + preview["width"] <= details["x"] + 2
            assert preview["width"] > details["width"]
        else:
            assert preview["y"] < details["y"]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        page.screenshot(path=evidence / "retained-native-context.png", full_page=True)
        original = page.request.get(base + "/api/jobs/" + job.id + "/result").json()
        assert original == result
        assert not errors
        browser.close()
    assert {row.id: row.status for row in store.list_jobs(1000)} == before_jobs
    assert {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files
    } == before_files
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "source_job": job.id,
                "target": "STAT6",
                "native_report_flags_unchanged": True,
                "native_passes": 22,
                "context_without_finite_measurements": 6,
                "missing_context_not_presented_as_pass": True,
                "original_files": before_files,
                "new_scientific_jobs": 0,
                "language": language,
                "width": width,
            },
            indent=2,
        )
    )
