"""Real frozen STAT6 controls, original coordinates and exact stage navigation; no inference."""

import csv
import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.example_preview_actions import ready_structure
from server_tests.reviewed_receptor_audit import verify_comparison
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace

DATA = json.loads(Path("frontend/src/examples/reviewed-receptor-data.json").read_text())


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_retained_receptor_comparison_opens_exact_quality_and_docking_without_jobs(
    restored_workspace, language, width
):
    settings, store, pins = restored_workspace
    pin = pins.get("diffsbdd.diversify", verify=True)
    assert str(pin.job_id) == DATA["job_id"]
    before = {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
    evidence = Path("outputs/receptor-case-comparison") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        info = page.request.get(base + "/api/examples/diffsbdd.diversify").json()
        verify_comparison(base, DATA, info)
        errors, writes = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=diffsbdd.diversify")
        page.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
        panel = page.locator(".reviewed-receptor")
        expect(panel).to_be_visible(timeout=45000)
        assert not panel.evaluate("node=>node.open")
        panel.locator("summary").click()
        table = panel.get_by_role(
            "table", name="受体与姿势对照" if zh else "Receptor and pose comparison"
        )
        expect(table.get_by_role("row")).to_have_count(4)
        for score in ("-7.29963", "-7.29302", "-6.36464"):
            expect(table.get_by_role("cell", name=score, exact=True)).to_be_visible()
        expect(panel.get_by_text("4.61 Å", exact=True)).to_be_visible()
        expect(panel.get_by_text("11.20 Å", exact=True)).to_be_visible()
        with page.expect_download() as download:
            panel.get_by_role(
                "link", name="下载对照表" if zh else "Download comparison", exact=True
            ).click()
        csv_path = evidence / "comparison.csv"
        download.value.save_as(csv_path)
        rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8-sig").splitlines()))
        assert len(rows) == 3
        for exported, source in zip(rows, DATA["poses"], strict=True):
            assert int(exported["pose"]) == source["rank"]
            assert float(exported["empirical_score_kcal_mol"]) == source["score_kcal_mol"]
            assert int(exported["unassessed"]) == 6 and int(exported["measured_pass"]) == 15
        page.screenshot(path=str(evidence / "comparison.png"), full_page=True)
        stage = page.get_by_role("combobox", name="研究阶段结果" if zh else "Study result stage")
        quality_ids = []
        for row in DATA["poses"]:
            if not panel.evaluate("node=>node.open"):
                panel.locator("summary").click()
            label = (
                ("预测域模型" if zh else "Predicted domain")
                if row["receptor"] == "predicted"
                else ("9BIG 实验构建体" if zh else "9BIG experimental construct")
            )
            name = (
                f"查看{label}姿势 {row['rank']} 的质控"
                if zh
                else f"Inspect {label} pose {row['rank']} quality"
            )
            panel.get_by_role("button", name=name, exact=True).click()
            expect(stage).to_have_value(row["quality_job"])
            assert not panel.evaluate("node=>node.open")
            quality = page.locator(".quality-results:visible")
            expect(quality).to_be_visible(timeout=30000)
            ready_structure(page, zh)
            # The visible read-only viewer must load the chosen quality report's paired files.
            assert page.locator(".quality-results:visible iframe").count() == 1
            files = quality.locator(".viewer-original-downloads")
            files.locator("summary").click()
            with page.expect_download() as pose_download:
                files.locator(
                    f'a[href*="/jobs/{row["quality_job"]}/download?name=molecule-preview.sdf"]'
                ).click()
            target = evidence / f"{row['receptor']}-pose-{row['rank']}.sdf"
            pose_download.value.save_as(target)
            sealed = next(
                entry
                for entry in info["pin"]["supporting_evidence"]
                if entry["job_id"] == row["quality_job"]
            )
            assert (
                hashlib.sha256(target.read_bytes()).hexdigest()
                == sealed["artifact_sha256"]["molecule-preview.sdf"]
            )
            files.locator("summary").click()
            quality_ids.append(row["quality_job"])
        panel.locator("summary").click()
        panel.get_by_role(
            "button",
            name="查看9BIG 实验构建体的全部姿势" if zh else "All 9BIG experimental construct poses",
            exact=True,
        ).click()
        expect(stage).to_have_value(DATA["poses"][2]["docking_job"])
        ready_structure(page, zh)
        expect(page.locator(".docking-results:visible table tbody tr")).to_have_count(20)
        page.screenshot(path=str(evidence / "experimental-poses.png"), full_page=True)
        stage.select_option(DATA["job_id"])
        ready_structure(page, zh)
        expect(
            page.get_by_role(
                "table",
                name="生成的候选分子" if zh else "Generated candidate molecules",
                exact=True,
            ).locator("tbody tr")
        ).to_have_count(3)
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
        assert not errors and not writes, {"errors": errors, "writes": writes}
        assert {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)} == before
        assert pins.get("diffsbdd.diversify", verify=True) == pin
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "quality_stages": quality_ids,
                    "csv_rows": len(rows),
                    "new_jobs": 0,
                    "source_checksums_unchanged": True,
                    "errors": errors,
                    "writes": writes,
                },
                indent=2,
            )
        )
        browser.close()
