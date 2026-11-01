"""Real R-group states, docking and quality stages after cold restore; no inference."""

import hashlib
import json
import os
import re
import sqlite3
from pathlib import Path

import pytest
from browser_platform import platform
from example_preview_actions import ready_structure
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.settings import Settings

PRIMARY = "23e97ba7-f90e-484d-a21d-0813454c608d"
STATES = "ff3d98a3-9465-4cbb-a240-8d52996c2104"
DOCKS = ("4ca90aae-aaa5-4b1c-8cbb-ecf45df97b64", "d53a9735-3e0e-4651-91f4-e93cfe067df9")
DOCK_SHA = (
    "9aefa9b74dcbfe4f20e0e824f4cd99f98a9d0e813ab7752e82f41bb4aa567185",
    "01cbb8506b9301962e60589b9cf7ffe457b24a384fe2d14fb4d272d48cba362a",
)
QUALITY = {
    "bf974dc3-5686-40bd-ae8c-bb889ca58cf3": (
        "11d15ac05c77b3101f1dd6ce8d8e5d9424d406ea5321d7f7ae997174abaae91f"
    ),
    "d3c19f28-4221-458f-9bd2-248d057c0fa7": (
        "77135e25d91286e34201083816ccd37326d15a331ad819104f33687eccc9b605"
    ),
}
RECEPTOR = "3250c6da6a3f406b62db8824e4ef8b27c89027da42d846393ec9601898a5ffa4"


def records(state):
    with sqlite3.connect(state / "jobs.sqlite3") as db:
        return {
            table: db.execute("SELECT * FROM " + table + " ORDER BY 1").fetchall()
            for table in ("jobs", "assets", "scientific_objects", "example_pins")
        }


def check_native_download(page, identifier, name, digest, target):
    selector = f'a[href="/api/jobs/{identifier}/download?name={name}"]'
    menu = page.locator("details.viewer-original-downloads:visible").filter(
        has=page.locator(selector)
    )
    if not page.locator(selector + ":visible").count():
        expect(menu).to_have_count(1)
        menu.locator("summary").click()
    geometry = None
    if menu.count() and menu.get_attribute("open") is not None:
        box = menu.locator("div").bounding_box()
        assert box is not None
        assert box["x"] >= 0
        assert box["x"] + box["width"] <= page.viewport_size["width"] + 0.5
        geometry = {"viewport_width": page.viewport_size["width"], **box}
    link = page.locator(selector + ":visible")
    expect(link).to_have_count(1)
    with page.expect_download() as transfer:
        link.click()
    transfer.value.save_as(target)
    assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
    return geometry


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_native_rgroup_stages_preserve_exact_poses_and_source_aware_quality(language, width):
    settings = Settings.from_env()
    archive = Path(os.environ["WB_TEST_REVIEWED_BUNDLE"])
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    restore_bundle(archive, settings, SHA256)
    before = records(settings.state_dir)
    evidence = Path("server_tests/evidence/reviewed-example-previews") / language / "rgroup"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, mutations, download_menus = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=reinvent.design")
        page.locator(".module-template:visible").get_by_role(
            "button", name="示例结果" if zh else "Example results", exact=True
        ).click()
        detail = page.request.get(base + "/api/examples/reinvent.design").json()
        assert detail["module"]["revision"] == 5 and detail["pin"]["job_id"] == PRIMARY
        assert [row["job_id"] for row in detail["pin"]["supporting_evidence"]] == [
            STATES,
            *DOCKS,
            *QUALITY,
        ]
        stage = page.get_by_label("研究阶段结果" if zh else "Study result stage", exact=True)
        expect(stage.locator("option")).to_have_count(6)
        ready_structure(page, zh)
        stage.select_option(STATES)
        expect(
            page.get_by_role("table", name="化学状态" if zh else "Chemical states", exact=True)
        ).to_be_visible()
        ready_structure(page, zh)
        page.get_by_role("tab", name="二维结构" if zh else "2D structure", exact=True).click()
        expect(
            page.locator(".molecular-preview:visible .molecule-image:visible")
        ).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        page.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
        ready_structure(page, zh)
        page.screenshot(path=str(evidence / "states.png"), full_page=True)
        for identifier in DOCKS:
            stage.select_option(identifier)
            ready_structure(page, zh)
            check_native_download(
                page,
                identifier,
                "pose-001.sdf",
                DOCK_SHA[DOCKS.index(identifier)],
                evidence / (identifier + ".sdf"),
            )
        for identifier, digest in QUALITY.items():
            stage.select_option(identifier)
            summary = page.get_by_role(
                "status", name="质控评估摘要" if zh else "Quality assessment summary"
            )
            expect(summary).to_contain_text(re.compile(r"(?:通过|Pass): 15"))
            expect(summary).to_contain_text(re.compile(r"(?:未评估|Not assessed): 6"))
            expect(summary).to_contain_text(re.compile(r"(?:不适用|Not applicable): 1"))
            ready_structure(page, zh)
            download_menus.append(
                check_native_download(
                    page,
                    identifier,
                    "molecule-preview.sdf",
                    digest,
                    evidence / (identifier + ".sdf"),
                )
            )
            download_menus.append(
                check_native_download(
                    page,
                    identifier,
                    "protein-preview.pdb",
                    RECEPTOR,
                    evidence / (identifier + ".pdb"),
                )
            )
            page.screenshot(path=str(evidence / (identifier + ".png")), full_page=True)
        stage.select_option(PRIMARY)
        ready_structure(page, zh)
        assert not errors and not mutations
        (evidence / "browser.json").write_text(
            json.dumps(
                {
                    "stages": [PRIMARY, STATES, *DOCKS, *QUALITY],
                    "errors": errors,
                    "mutations": mutations,
                    "download_menu_bounds": download_menus,
                }
            )
        )
        browser.close()
    assert records(settings.state_dir) == before
