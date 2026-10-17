"""Real STAT6 library, SQLite/API and native Ketcher; read-only viewing never runs science."""

import csv
import hashlib
import io
import json
import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from browser_platform import platform
from dataset_native_fixture import Native
from playwright.sync_api import expect, sync_playwright
from test_library_member_native import SOURCE, prepare

from opendde_workbench.assets import AssetStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store

EVIDENCE = Path("server_tests/evidence/library-members")


def persisted_native_library(tmp_path, monkeypatch):
    settings = Settings.from_env()
    store = Store(settings.state_dir / "jobs.sqlite3")
    asset = AssetStore(store, settings.state_dir / "assets").save(
        "STAT6-reference-library.sdf", "ligand", SOURCE.read_bytes()
    )
    native = Native(tmp_path / "native", monkeypatch)
    material = native.material(SOURCE.read_bytes(), ".sdf", "data")
    native.bindings[asset.id] = native.bindings.pop(material["source"]["asset_id"])
    material["source"] = {"asset_id": asset.id, "sha256": asset.sha256}
    (native.root / "input/bindings.json").write_text(json.dumps(native.bindings))
    task = prepare(native, material)
    job = store.create(task, str(uuid4()), max_pending=8, max_jobs=100)
    root = settings.state_dir / "jobs" / job.id / "output"
    shutil.copytree(native.root / "output", root)
    with store.connect() as db:
        db.execute("UPDATE jobs SET status='succeeded' WHERE id=?", (job.id,))
    return settings, store, job.id, root / "library.sqlite"


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_prepared_stat6_library_has_native_inspection_switching_and_portable_downloads(
    tmp_path, monkeypatch, language, width
):
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    settings, store, job, database = persisted_native_library(tmp_path, monkeypatch)
    original = database.read_bytes()
    before_jobs = [(item.id, item.status) for item in store.list_jobs()]
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        context = browser.new_context(
            viewport={"width": width, "height": 1000}, accept_downloads=True
        )
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{base}/#view=results&module=screening&task={job}")
        inspector = page.get_by_role(
            "region", name="分子库成员结构检查" if zh else "Library member inspection"
        )
        expect(inspector.get_by_role("heading", name="CHEMBL374380", exact=True)).to_be_visible(
            timeout=30000
        )
        inspector.locator(".molecule-image img").wait_for(timeout=60000)
        assert not inspector.locator('iframe[src*="viewer.html"]').count()
        page.get_by_role(
            "searchbox", name="搜索成员或货号" if zh else "Search members or IDs", exact=True
        ).fill("CHEMBL487451")
        page.get_by_role("button", name="CHEMBL487451", exact=True).click()
        expect(inspector.get_by_role("heading", name="CHEMBL487451", exact=True)).to_be_visible()
        inspector.locator(".molecule-image img").wait_for(timeout=30000)
        detail = page.request.get(
            f"{base}/api/datasets/{job}/members/detail",
            params={
                "member_id": "cmp-64471c6e6154d8cd52c8a2bdb0f1cb6ec5a60a2c3a76f99e086b9b509c29a1a4"
            },
        ).json()
        assert detail["geometry"] == "source_2d" and detail["source_record"] == 2
        with page.expect_download() as transfer:
            inspector.get_by_role(
                "link", name="原始结构 MOL" if zh else "Original structure MOL", exact=True
            ).click()
        file = evidence / "CHEMBL487451.mol"
        transfer.value.save_as(file)
        assert hashlib.sha256(file.read_bytes()).hexdigest() == detail["sha256"]
        with page.expect_download() as transfer:
            page.get_by_role(
                "button", name="导出当前页 CSV" if zh else "Export page CSV", exact=True
            ).click()
        table = evidence / "filtered-page.csv"
        transfer.value.save_as(table)
        rows = list(csv.DictReader(io.StringIO(table.read_text(encoding="utf-8-sig"))))
        assert len(rows) == 1 and rows[0]["display_name"] == "CHEMBL487451"
        assert rows[0]["dataset_job"] == job and rows[0]["source_record"] == "2"
        left, right = (
            page.locator(".structure-workbench-view").bounding_box(),
            page.locator(".structure-workbench-details").bounding_box(),
        )
        assert left and right
        assert (
            (left["x"] < right["x"] and left["width"] > 450)
            if width > 1000
            else (left["y"] < right["y"])
        )
        inspector.get_by_role(
            "button", name="保存为历史文件" if zh else "Save to historical files", exact=True
        ).click()
        expect(inspector.get_by_role("status")).to_contain_text(
            "已保存到历史文件" if zh else "Saved to historical files"
        )
        page.screenshot(path=str(evidence / "native-member-workspace.png"), full_page=True)
        assert not errors, errors
        assert [(item.id, item.status) for item in store.list_jobs()] == before_jobs
        assert database.read_bytes() == original
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "job": job,
                    "members": 38,
                    "source_geometry": "source_2d",
                    "native_mol_sha256": detail["sha256"],
                    "csv_records": len(rows),
                    "new_scientific_jobs": 0,
                    "source_database_unchanged": True,
                }
            )
        )
        browser.close()
