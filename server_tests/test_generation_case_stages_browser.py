"""Replay the real retained STAT6 design study through its module example, without inference."""

import hashlib
import json
import os
import struct
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

GENERATED = "be6389cf-e6ce-4d2e-ae5a-9786d62dfe8a"
RAW_QUALITY = (
    "196e65f2-e55f-42de-bbe9-6be612804970",
    "142b0f4e-50f2-4a3c-b6bf-c572ee4f8a47",
)
RELAXED = "f34af532-29df-4d09-adff-0a78bc09f7c5"
REFINED = "e779e1fc-4488-412f-9983-540205389041"
QUALITY = "b5b7a896-929b-45ad-88b9-e147c5b7540f"


def file_hashes(state):
    files = []
    for identifier in (GENERATED, *RAW_QUALITY, RELAXED, REFINED, QUALITY):
        folder = state / "jobs" / identifier / "output"
        assert folder.is_dir()
        files.extend(path for path in folder.rglob("*") if path.is_file())
    return {
        str(path.relative_to(state)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in files
    }


def quality_panel(page, zh):
    return page.get_by_role("region", name="构象与姿势质控结果" if zh else "Pose quality results")


def assert_template_replay(page, store, evidence, zh):
    with store.connect() as db:
        original = json.loads(
            db.execute("SELECT request FROM jobs WHERE id=?", (GENERATED,)).fetchone()["request"]
        )
    with page.expect_response(
        lambda response: response.url.endswith("/api/examples/diffsbdd.generate/prepare")
    ) as pending:
        page.get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
    assert pending.value.ok
    prepared = pending.value.json()
    assert prepared["request"] == original
    assert prepared["study"]["required_materials"] == []
    assert "AK-1690" not in str(prepared["study"]["guide"]["steps"])
    next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
    next_step.click()
    expect(
        page.get_by_role(
            "combobox", name="如何指定口袋？" if zh else "How should the pocket be defined?"
        )
    ).to_have_value("residues")
    residues = original["payload"]["pocket"]["residues"]
    assert len(residues) == 37
    expect(
        page.get_by_role(
            "textbox",
            name="已选残基（也可输入 A:10, A:11）"
            if zh
            else "Selected residues (or enter A:10, A:11)",
        )
    ).to_have_value(", ".join(f"{row['chain']}:{row['number']}" for row in residues))
    next_step.click()
    expect(
        page.get_by_role("combobox", name="这次生成多少候选？" if zh else "How many candidates?")
    ).to_have_value("3")
    page.get_by_role("button", name="专家微调" if zh else "Expert settings", exact=True).click()
    visible = json.loads(
        page.get_by_role(
            "textbox",
            name="当前模式与模型的原生参数" if zh else "Native settings for this mode and model",
        ).input_value()
    )
    for key in (
        "model",
        "count",
        "steps",
        "seed",
        "size_mode",
        "size_bias",
        "minimum_atoms",
        "fragment_policy",
        "relaxation",
    ):
        assert visible[key] == original["payload"]["options"][key]
    next_step.click()
    expect(
        page.get_by_text("37 个选定残基" if zh else "37 selected residues", exact=True)
    ).to_be_visible()
    page.screenshot(path=evidence / "exact-template-review.png", full_page=True)
    (evidence / "prepared-native-recipe.json").write_text(json.dumps(prepared, indent=2))


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_module_case_preserves_raw_generation_and_all_reviewed_stages(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    store = Store(settings.state_dir / "jobs.sqlite3")
    before_jobs = {job.id: job.status for job in store.list_jobs(1000)}
    evidence = Path("outputs/generation-case-stages") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        info = page.request.get(base + "/api/examples/diffsbdd.generate").json()
        (evidence / "case-source.json").write_text(json.dumps(info, indent=2))
        page.goto(base)
        page.get_by_role(
            "button",
            name="口袋条件分子生成" if zh else "Pocket-conditioned molecule generation",
            exact=True,
        ).click()
        page.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
        choose = page.get_by_role("combobox", name="研究阶段结果" if zh else "Study result stage")
        try:
            expect(choose).to_be_visible(timeout=15000)
        finally:
            page.screenshot(path=evidence / "module-case-opening.png", full_page=True)
        assert info["computed_result_available"] and info["pin"]["job_id"] == GENERATED
        assert [row["job_id"] for row in info["pin"]["supporting_evidence"]] == [
            *RAW_QUALITY,
            RELAXED,
            REFINED,
            QUALITY,
        ]
        before_files = file_hashes(settings.state_dir)
        expect(choose.locator("option")).to_have_count(6)
        table = page.get_by_role(
            "table", name="生成的候选分子" if zh else "Generated candidate molecules"
        )
        expect(table.get_by_role("row")).to_have_count(4)
        table.get_by_text("候选 3" if zh else "Candidate 3", exact=True).click()
        for identifier in RAW_QUALITY:
            choose.select_option(identifier)
            summary = quality_panel(page, zh).get_by_role(
                "status", name="质控评估摘要" if zh else "Quality assessment summary"
            )
            expect(
                summary.get_by_text("需要复核: 3" if zh else "Needs review: 3", exact=True)
            ).to_be_visible()
        choose.select_option(RELAXED)
        relaxed = page.get_by_role(
            "region", name="能量最小化结果" if zh else "Energy minimization results"
        )
        expect(relaxed.get_by_role("cell", name="186.64 kcal/mol", exact=True)).to_be_visible()
        expect(relaxed.get_by_role("cell", name="24.25 kcal/mol", exact=True)).to_be_visible()
        expect(
            relaxed.get_by_role("cell", name="已收敛" if zh else "Converged", exact=True)
        ).to_be_visible()
        choose.select_option(REFINED)
        refined = page.get_by_role("table", name="GNINA 1.3.3", exact=True)
        expect(refined.get_by_role("cell", name="-3.861", exact=True)).to_be_visible()
        expect(refined.get_by_role("cell", name="4.617", exact=True)).to_have_count(2)
        pose = page.get_by_role(
            "link", name="下载所选姿势 SDF" if zh else "Download selected pose SDF"
        )
        response = page.request.get(base + pose.get_attribute("href"))
        assert response.ok
        original_pose = settings.state_dir / "jobs" / REFINED / "output" / "pose-001.sdf"
        assert response.body() == original_pose.read_bytes()
        choose.select_option(QUALITY)
        panel = quality_panel(page, zh)
        summary = panel.get_by_role(
            "status", name="质控评估摘要" if zh else "Quality assessment summary"
        )
        for text in (
            ["通过: 14", "未评估: 6", "不适用: 2"]
            if zh
            else ["Pass: 14", "Not assessed: 6", "Not applicable: 2"]
        ):
            expect(summary.get_by_text(text, exact=True)).to_be_visible()
        panel.get_by_role(
            "combobox", name="显示哪些检查？" if zh else "Which checks?"
        ).select_option("unassessed")
        expect(panel.get_by_role("table").get_by_role("row")).to_have_count(7)
        capture = panel.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=30000)
        left = panel.locator(".structure-workbench-view").bounding_box()
        right = panel.locator(".structure-workbench-details").bounding_box()
        assert left and right
        if width > 1000:
            assert left["x"] + left["width"] <= right["x"] + 2 and left["width"] > right["width"]
        else:
            assert left["y"] < right["y"]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        capture.click()
        snapshot = panel.locator(".viewer-snapshot")
        expect(snapshot.locator("img")).to_be_visible()
        with page.expect_download() as pending:
            snapshot.locator("a[download]").click()
        downloaded = evidence / "native-final-view.png"
        pending.value.save_as(downloaded)
        image = downloaded.read_bytes()
        assert image.startswith(b"\x89PNG\r\n\x1a\n")
        assert all(value > 0 for value in struct.unpack(">II", image[16:24]))
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=evidence / "final-reviewed-stage.png", full_page=True)
        choose.select_option(GENERATED)
        expect(
            page.get_by_role("heading", name="候选 3" if zh else "Candidate 3", exact=True)
        ).to_be_visible()
        expect(table.get_by_role("row")).to_have_count(4)
        assert_template_replay(page, store, evidence, zh)
        assert not errors
        browser.close()
    assert {job.id: job.status for job in store.list_jobs(1000)} == before_jobs
    assert file_hashes(settings.state_dir) == before_files
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "primary_job": GENERATED,
                "supporting_jobs": [*RAW_QUALITY, RELAXED, REFINED, QUALITY],
                "module_example_stages": 6,
                "raw_selected_candidate_retained": 3,
                "native_reports_and_files_unchanged": True,
                "new_scientific_jobs": 0,
                "exact_authored_template_recipe": True,
                "language": language,
                "width": width,
                "fresh_english_default": not zh,
                "whole_platform_or_experimental_acceptance": False,
            },
            indent=2,
        )
    )
