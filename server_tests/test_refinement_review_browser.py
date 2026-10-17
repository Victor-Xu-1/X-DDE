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
        page.get_by_role("link", name="refined-structure.pdb", exact=True).click()
    original = evidence / "browser-refined-structure.pdb"
    transfer.value.save_as(original)
    assert hashlib.sha256(original.read_bytes()).hexdigest() == PDB_SHA
    with page.expect_download() as transfer:
        page.get_by_role("button", name="导出筛选结果" if zh else "Export filtered rows").click()
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


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_actual_preparation_example_units_structure_and_downloads_are_read_only(
    restored_refinement, language, width
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
        page = browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
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
        for name in ENERGIES:
            expect(actual.get_by_role("columnheader").filter(has_text=name)).to_be_visible()
        assert (
            actual.get_by_title(
                "OpenMM vacuum potential with backbone positional restraints · kJ/mol", exact=True
            ).count()
            == 2
        )
        ready_structure(page, zh)
        left = actual.locator(".structure-workbench-view").bounding_box()
        right = actual.locator(".structure-workbench-details").bounding_box()
        assert left and right
        assert (
            (left["x"] < right["x"] and left["width"] > 450)
            if width > 1000
            else left["y"] < right["y"]
        )
        downloads(page, evidence, zh)
        page.screenshot(path=str(evidence / "native-refinement-example.png"), full_page=True)
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
                    "full_precision_csv_and_byte_identical_pdb": True,
                    "native_png_export": True,
                    "structure_on_left_or_above_mobile_details": True,
                    "blank_upload_draft_preserved": True,
                    "api_writes": writes,
                    "new_refinement_dynamics_fep": 0,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
