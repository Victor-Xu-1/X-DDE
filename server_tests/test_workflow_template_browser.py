"""Real retained study recipes load through the questionnaire without starting inference."""

import csv
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_stat6_templates_browser import catalog


@pytest.mark.parametrize("language", ["en", "zh"])
def test_workflow_template_is_guided_measured_and_does_not_submit_on_load(language):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    evidence = Path("outputs/workflow-template") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["workflows"].label[0 if zh else 1], exact=True
        ).locator("..").click()
        page.locator(".module-template:visible").get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
        expect(
            page.get_by_role(
                "combobox",
                name="如何准备研究计划？" if zh else "How should the research plan be prepared?",
            )
        ).to_have_value("case", timeout=30000)
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_step).to_be_enabled()
        next_step.click()
        expect(
            page.get_by_text(
                "· 必须通过指定实测检查" if zh else "· Required measured checks must pass",
                exact=True,
            )
        ).to_be_visible()
        assert page.locator("main .questionnaire > fieldset:visible").count() == 1
        page.screenshot(path=evidence / "measured-steps.png", full_page=True)
        assert page.request.get(base + "/api/jobs").json() == before
        # Read the actual recorded child and verify a user download, without
        # submitting a substitute descriptor calculation or changing its inputs.
        fixed = page.request.get(base + "/api/examples/workflows/result?profile=stat6")
        assert fixed.ok
        record = fixed.json()["record"]
        property_job = next(
            row["job_id"] for row in record["run"]["attempts"] if row["step_id"] == "properties"
        )
        native = page.request.get(base + "/api/jobs/" + property_job + "/result").json()
        expected = native["molecules"][0]
        page.goto(base + "/#task=" + property_job)
        table = page.get_by_role(
            "table", name="分子性质 · RDKit 计算" if zh else "Molecular properties · RDKit"
        )
        expect(table).to_be_visible(timeout=30000)
        with page.expect_download() as download:
            page.get_by_role(
                "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
            ).click()
        target = evidence / "native-properties.csv"
        download.value.save_as(target)
        with target.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.reader(stream))
        assert len(rows) == 2 and len(rows[1]) == 9
        assert [float(value) for value in rows[1][1:]] == [
            expected[key]
            for key in ("mw", "logp", "tpsa", "qed", "sa", "hbd", "hba", "rotatable_bonds")
        ]
        (evidence / "native-property-download.json").write_text(
            json.dumps(
                {
                    "source_job": property_job,
                    "exact_native_metrics_preserved": True,
                    "scientific_tasks_created": 0,
                    "language": language,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        assert page.request.get(base + "/api/jobs").json() == before
        browser.close()
