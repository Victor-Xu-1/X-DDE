"""Replay the immutable native STAT6 preparation case; never launch refinement or simulations."""

import csv
import hashlib
import json
import os
import sqlite3
from pathlib import Path

import pytest
from browser_platform import platform
from example_preview_actions import ready_structure
from playwright.sync_api import expect, sync_playwright
from test_navigation_shell_browser import open_navigation

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import CAPABILITIES, SHA256
from opendde_workbench.settings import Settings

JOB = "080b4bb4-05d2-497b-babe-95b94612a9bd"
PDB_SHA = "f03dc640001a86577e3e0c1d57eea1f2a8270fb8853c797f7821fa80fed9b501"
ENERGIES = {
    "Initial potential energy (kJ/mol)": -50383.56773217576,
    "Final potential energy (kJ/mol)": -58503.15506459447,
}
EVIDENCE = Path("server_tests/evidence/refinement-review")


def records(state):
    with sqlite3.connect(state / "jobs.sqlite3") as db:
        return {
            table: db.execute("SELECT * FROM " + table + " ORDER BY 1").fetchall()
            for table in ("jobs", "scientific_objects", "example_pins", "example_record_pins")
        }


@pytest.fixture(scope="module")
def restored_refinement():
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    archive = Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    restored = restore_bundle(archive, settings, SHA256)
    assert restored["computed"] == len(CAPABILITIES)
    assert restore_bundle(archive, settings, SHA256) == restored
    return settings


def downloads(page, evidence, zh):
    with page.expect_download() as transfer:
        page.get_by_role(
            "link", name="下载优化后结构" if zh else "Download refined structure", exact=True,
        ).click()
    original = evidence / "browser-refined-structure.pdb"
    transfer.value.save_as(original)
    assert hashlib.sha256(original.read_bytes()).hexdigest() == PDB_SHA
    with page.expect_download() as transfer:
        page.get_by_role("button", name="导出指标 CSV" if zh else "Export metrics CSV").click()
    exported = evidence / "browser-native-metrics.csv"
    transfer.value.save_as(exported)
    with exported.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 1
    assert all(float(rows[0][name]) == value for name, value in ENERGIES.items())
    ready_structure(page, zh).click()
    image = page.get_by_role("link", name="下载视图 PNG" if zh else "Download view PNG", exact=True)
    expect(image).to_be_visible(timeout=30000)
    with page.expect_download() as transfer:
        image.click()
    png = evidence / "browser-native-3d.png"
    transfer.value.save_as(png)
    assert png.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") and png.stat().st_size > 5000
    page.get_by_role("button", name="关闭图片" if zh else "Close image", exact=True).click()


def verify_expansion(actual, canvas, zh):
    button = actual.get_by_role(
        "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True,
    )
    iframe = actual.locator(".molecular-stage iframe")
    frame = iframe.element_handle()
    assert frame
    button.click()
    expect(actual.locator(".structure-workbench")).to_have_attribute(
        "data-workspace-expanded", "true"
    )
    expanded = iframe.bounding_box()
    assert expanded and expanded["width"] > canvas["width"]
    assert frame.evaluate("frame => frame.isConnected")
    actual.get_by_role(
        "button", name="关闭展开视图" if zh else "Close expanded view", exact=True,
    ).press("Escape")
    expect(button).to_be_focused()
    assert frame.evaluate("frame => frame.isConnected")
    return expanded


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1280, 720), ("zh", 1600, 900),
])
def test_actual_preparation_example_units_structure_and_downloads_are_read_only(
    restored_refinement, language, width, height
):
    settings = restored_refinement
    before = records(settings.state_dir)
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
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
        detail = page.request.get(base + "/api/examples/openmm.refine").json()
        assert detail["pin"]["job_id"] == JOB
        native = page.request.get(base + "/api/jobs/" + JOB + "/result").json()
        assert native["artifact_sha256"]["refined-structure.pdb"] == PDB_SHA
        page.goto(base + "/")
        open_navigation(page, language).get_by_role(
            "button", name="动力学与 FEP" if zh else "Dynamics and FEP", exact=True
        ).click()
        page.locator(".module-task-picker select:visible").select_option("openmm.refine")
        new_file = page.get_by_role(
            "radio", name="上传新文件" if zh else "Upload a new file", exact=True
        )
        expect(new_file).to_be_checked()
        page.locator(".module-template:visible").get_by_role(
            "button", name="示例结果" if zh else "Example results", exact=True
        ).click()
        actual = page.get_by_role(
            "region", name="模板的真实结果" if zh else "Actual template result"
        )
        expect(actual).to_be_visible(timeout=30000)
        summary = actual.get_by_role("region", name="结构精修结果" if zh else "Refinement result")
        viewport = summary.bounding_box()
        assert viewport
        expect(summary.get_by_role("searchbox")).to_have_count(0)
        for label in ("优化前势能", "优化后势能") if zh else ("Initial energy", "Final energy"):
            row = summary.get_by_role("row").filter(has_text=label)
            expect(row).to_contain_text("kJ/mol")
            bounds = row.bounding_box()
            assert bounds and bounds["x"] >= viewport["x"] - 1
            assert bounds["x"] + bounds["width"] <= viewport["x"] + viewport["width"] + 1
        assert (
            actual.get_by_title(
                "OpenMM vacuum potential with backbone positional restraints · kJ/mol", exact=True
            ).count()
            == 2
        )
        ready_structure(page, zh)
        left = actual.locator(".structure-workbench-view").bounding_box()
        right = actual.locator(".structure-workbench-details").bounding_box()
        canvas = actual.locator(".molecular-stage iframe").bounding_box()
        assert left and right and canvas
        assert left["x"] < right["x"] and abs(left["y"] - right["y"]) <= 1
        assert canvas["width"] >= 600 and canvas["height"] >= 500
        assert viewport["y"] + viewport["height"] < height and viewport["height"] <= 230
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        expanded = verify_expansion(actual, canvas, zh)
        downloads(page, evidence, zh)
        actual.locator(".structure-workbench-view").scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / "native-refinement-example.png"))
        summary.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / "native-energy-table.png"))
        page.get_by_role(
            "button", name="返回任务填写" if zh else "Return to task form", exact=True
        ).click()
        expect(new_file).to_be_checked()
        expect(
            page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_disabled()
        assert not errors and not writes, {"errors": errors, "api_writes": writes}
        assert records(settings.state_dir) == before
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "source_job": JOB,
                    "language": language,
                    "width": width,
                    "cold_restored_actual_native_files": True,
                    "visible_energy_units": True,
                    "native_energy_rows_fit_without_horizontal_scroll": True,
                    "full_precision_csv_and_byte_identical_pdb": True,
                    "native_png_export": True,
                    "desktop_native_canvas": canvas,
                    "expanded_native_canvas": expanded,
                    "blank_upload_draft_preserved": True,
                    "api_writes": writes,
                    "new_refinement_dynamics_fep": 0,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
