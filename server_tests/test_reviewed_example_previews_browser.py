"""Actual portable STAT6 results, native Ketcher/WebGL and no science on example viewing."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path

import pytest
from browser_platform import platform
from playwright.sync_api import expect, sync_playwright
from test_navigation_shell_browser import open_navigation

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import CAPABILITIES, SHA256
from opendde_workbench.settings import Settings

EVIDENCE = Path("server_tests/evidence/reviewed-example-previews")
MEMBERS = ("CHEMBL487451", "CHEMBL374380", "CHEMBL520539")
RAW_FIRST_SHA = "10af8e4169bd7c86db9dc914804e15ce4e8d72e288b9ae17573c0ce688d0bf37"


def records(state):
    with sqlite3.connect(state / "jobs.sqlite3") as db:
        return {
            table: db.execute("SELECT * FROM " + table + " ORDER BY 1").fetchall()
            for table in ("jobs", "scientific_objects", "example_pins")
        }


def ready_structure(page, zh):
    label = "生成三维视图图片" if zh else "Capture 3D view"
    capture = page.locator(f'button[aria-label="{label}"]:visible')
    expect(capture).to_be_enabled(timeout=60000)
    return capture


def choose_task(page, language, key):
    zh = language == "zh"
    if not page.locator(".module-task-picker select").count():
        navigation = open_navigation(page, language)
        navigation.get_by_role(
            "button", name="高通量筛选" if zh else "High-throughput screening", exact=True
        ).click()
    page.locator(".module-task-picker select").select_option(key)
    toolbar = page.locator(".module-template:visible")
    toolbar.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
    expect(
        page.get_by_role("region", name="模板的真实结果" if zh else "Actual template result")
    ).to_be_visible()


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_cold_restored_stat6_examples_show_exact_molecules_without_starting_science(
    language, width
):
    archive = Path(os.environ["WB_TEST_REVIEWED_BUNDLE"])
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    first = restore_bundle(archive, settings, SHA256)
    assert first["modules"] == len(CAPABILITIES) == 30
    assert restore_bundle(archive, settings, SHA256) == first
    before = records(settings.state_dir)
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, mutations = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base)
        choose_task(page, language, "library.select")
        detail = page.request.get(base + "/api/examples/library.select").json()
        stages = detail["supporting_stage_names"]
        assert len(stages) == 3
        assert all(sum(member in label for label in stages.values()) == 1 for member in MEMBERS)
        assert len(set(stages.values())) == 3
        candidate = page.locator(".dataset-preview-pane")
        expect(candidate.locator(".dataset-panel-title strong")).to_have_text(MEMBERS[0])
        ready_structure(page, zh)
        assert not page.get_by_label(
            "Pose 优化与历史" if zh else "Pose optimization and history", exact=True
        ).count()
        for member in MEMBERS:
            page.get_by_role("button", name=member, exact=True).click()
            expect(candidate.locator(".dataset-panel-title strong")).to_have_text(member)
            ready_structure(page, zh)
            candidate.get_by_role("tab", name="二维结构" if zh else "2D structure").click()
            drawing = candidate.locator(".molecule-image:visible").first
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
            drawing.locator("img").evaluate("image => image.decode()")
            candidate.get_by_role("tab", name="三维结构" if zh else "3D structure").click()
            ready_structure(page, zh)
        page.get_by_role("button", name=MEMBERS[0], exact=True).click()
        capture = ready_structure(page, zh)
        with page.expect_download() as transfer:
            candidate.get_by_role(
                "link", name="下载当前结构" if zh else "Download selected structure"
            ).click()
        native = evidence / (MEMBERS[0] + ".sdf")
        transfer.value.save_as(native)
        assert hashlib.sha256(native.read_bytes()).hexdigest() == RAW_FIRST_SHA
        capture.click()
        png = page.get_by_role(
            "link", name="下载视图 PNG" if zh else "Download view PNG", exact=True
        )
        expect(png).to_be_visible(timeout=30000)
        with page.expect_download() as transfer:
            png.click()
        image = evidence / "native-3d.png"
        transfer.value.save_as(image)
        assert image.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") and image.stat().st_size > 5000
        page.get_by_role("button", name="关闭图片" if zh else "Close image", exact=True).click()
        stage = page.get_by_label("研究阶段结果" if zh else "Study result stage", exact=True)
        for identifier, label in stages.items():
            stage.select_option(identifier)
            expect(
                page.get_by_role(
                    "region", name="能量最小化结果" if zh else "Energy minimization results"
                )
            ).to_be_visible()
            ready_structure(page, zh)
            assert next(member for member in MEMBERS if member in label)
        stage.select_option(detail["pin"]["job_id"])
        ready_structure(page, zh)
        left = page.locator(".dataset-preview-pane").bounding_box()
        right = page.locator(".dataset-candidate-table").bounding_box()
        assert left and right
        assert (
            (left["x"] < right["x"] and left["width"] > 450)
            if width > 1000
            else left["y"] < right["y"]
        )
        page.screenshot(
            path=str(evidence / "candidate-result.png"), full_page=True, animations="disabled"
        )
        choose_task(page, language, "library.import")
        inspector = page.get_by_role(
            "region", name="分子库成员结构检查" if zh else "Library member inspection"
        )
        expect(inspector.get_by_role("heading", name="CHEMBL374380", exact=True)).to_be_visible(
            timeout=30000
        )
        expect(inspector.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=60000
        )
        assert not inspector.locator('iframe[src*="viewer.html"]').count()
        page.screenshot(
            path=str(evidence / "prepared-library.png"), full_page=True, animations="disabled"
        )
        page.reload()
        expect(page.locator("html")).to_have_attribute("lang", language)
        assert not errors, errors
        assert not mutations, mutations
        browser.close()
    assert records(settings.state_dir) == before
    (evidence / "acceptance.json").write_text(
        json.dumps(
            {
                "archive_sha256": SHA256,
                "computed_cases": 30,
                "members": MEMBERS,
                "native_source_sha256": RAW_FIRST_SHA,
                "unique_stage_captions": stages,
                "api_mutations": mutations,
                "jobs_and_scientific_versions_unchanged": True,
                "native_2d_and_3d": True,
                "original_sdf_and_view_png_downloads": True,
                "language": language,
                "viewport_width": width,
                "page_errors": errors,
            },
            indent=2,
        )
        + "\n"
    )
