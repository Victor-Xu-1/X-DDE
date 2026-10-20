"""Real revised module examples, stage selection and downloads, without inference."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

CASES = [
    (
        "reinvent.design",
        "23e97ba7-f90e-484d-a21d-0813454c608d",
        "ff3d98a3-9465-4cbb-a240-8d52996c2104",
    ),
    ("gnina.dock", "5d2c6867-0563-488a-bda0-9f063458f0d8", "2647de20-9c41-48fd-93a5-0192275ec38b"),
]


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("capability,primary,support", CASES)
def test_revised_module_example_stages_and_exact_replay(language, capability, primary, support):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    store = Store(settings.state_dir / "jobs.sqlite3")
    before = {job.id: job.status for job in store.list_jobs(1000)}
    evidence = Path("outputs/original-port-case") / capability / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        info = page.request.get(base + "/api/examples/" + capability).json()
        assert info["computed_result_available"] and info["pin"]["revision"] == 4
        assert info["pin"]["job_id"] == primary
        assert [row["job_id"] for row in info["pin"]["supporting_evidence"]] == [support]
        page.goto(base)
        page.get_by_role(
            "button", name=CAPABILITIES[capability].label[0 if zh else 1], exact=True
        ).click()
        page.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
        choose = page.get_by_role("combobox", name="研究阶段结果" if zh else "Study result stage")
        expect(choose.locator("option")).to_have_count(2)
        if capability == "reinvent.design":
            expect(
                page.get_by_role(
                    "table", name="研究候选" if zh else "Research candidates"
                ).get_by_role("row")
            ).to_have_count(19)
        else:
            table = page.get_by_role("table", name="GNINA 1.3.3", exact=True)
            expect(table.get_by_role("row")).to_have_count(21)
            table.get_by_role("button", name="姿势 2" if zh else "Pose 2", exact=True).click()
            link = page.get_by_role(
                "link", name="下载所选姿势 SDF" if zh else "Download selected pose SDF"
            )
            expect(link).to_have_attribute(
                "href", f"/api/jobs/{primary}/download?name=pose-002.sdf"
            )
            response = page.request.get(base + link.get_attribute("href"))
            assert (
                response.ok
                and response.body()
                == (settings.state_dir / "jobs" / primary / "output" / "pose-002.sdf").read_bytes()
            )
        capture = page.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=30000)
        page.screenshot(path=evidence / "native-primary-view.png", full_page=True)
        choose.select_option(support)
        if capability == "reinvent.design":
            expect(
                page.get_by_role("table", name="化学状态" if zh else "Chemical states").get_by_role(
                    "row"
                )
            ).to_have_count(11)
        else:
            summary = page.get_by_role(
                "status", name="质控评估摘要" if zh else "Quality assessment summary"
            )
            for text in (
                ["通过: 15", "未评估: 6", "不适用: 1"]
                if zh
                else ["Pass: 15", "Not assessed: 6", "Not applicable: 1"]
            ):
                expect(summary.get_by_text(text, exact=True)).to_be_visible()
        expect(capture).to_be_enabled(timeout=30000)
        page.screenshot(path=evidence / "reviewed-followup.png", full_page=True)
        choose.select_option(primary)
        with page.expect_response(
            lambda response: response.url.endswith("/api/examples/" + capability + "/prepare")
        ) as prepared:
            page.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        assert prepared.value.ok
        with store.connect() as db:
            original = json.loads(
                db.execute("SELECT request FROM jobs WHERE id=?", (primary,)).fetchone()["request"]
            )
        assert prepared.value.json()["request"] == original
        page.screenshot(path=evidence / "exact-input-template.png", full_page=True)
        browser.close()
    assert {job.id: job.status for job in store.list_jobs(1000)} == before
