"""Real retained STAT6 frames through the new-region questionnaire; no inference."""

import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle_restore import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.research.receptor_sets import ReceptorSets
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_DEFINED_SITE_ARCHIVE"), reason="Select the retained STAT6 browser gate."
)
ALIGNMENT = "90df5f6d-75e8-4990-a696-e06b43b6a7f2"
LIGAND = Path(__file__).parents[1] / "tests/fixtures/stat6/9big-ak1690.sdf"


def reference_bounds():
    """Explicit box from deposited SDF heavy-atom extents, not predicted cavity evidence."""
    lines = LIGAND.read_text().splitlines()
    assert "V2000" in lines[3]
    atoms = lines[4 : 4 + int(lines[3][:3])]
    xyz = [
        [float(line[axis * 10 : (axis + 1) * 10]) for axis in range(3)]
        for line in atoms
        if line[31:34].strip() not in {"H", "D"}
    ]
    lower, upper = (
        [min(v[i] for v in xyz) for i in range(3)],
        [max(v[i] for v in xyz) for i in range(3)],
    )
    return [(lo + hi) / 2 for lo, hi in zip(lower, upper, strict=True)], [
        hi - lo + 8 for lo, hi in zip(lower, upper, strict=True)
    ]


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_reference_and_manual_regions_save_and_compile_without_running(
    language, width, tmp_path, monkeypatch
):
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WB_AUTO_DEPLOY", "0")
    settings = Settings.from_env()
    archive = Path(os.environ["WB_DEFINED_SITE_ARCHIVE"])
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    restore_bundle(archive, settings, SHA256)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    job = store.get(ALIGNMENT)
    assert job and job.status == "succeeded"
    indexed = OutputCatalog(store, assets).index(
        job, settings.state_dir / "jobs" / ALIGNMENT / "output"
    )
    assert indexed["state"] == "complete", indexed
    ensemble = next(v for v in ReceptorSets(store, assets).list() if str(v.source_job) == ALIGNMENT)
    before = {row.id: row.status for row in store.list_jobs()}
    assert not any(status in {"queued", "running", "cancelling"} for status in before.values())
    evidence = Path("outputs/defined-regions") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    center, size = reference_bounds()
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        errors, scientific_posts = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda r: (
                scientific_posts.append(r.url)
                if r.method == "POST" and ("/api/jobs" in r.url or "/runs" in r.url)
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("pose_exploration")
        expect(
            page.get_by_role(
                "radio", name="新建搜索区域" if zh else "New search regions", exact=True
            )
        ).to_be_checked()
        choices = page.get_by_role(
            "combobox", name="使用哪组对齐受体？" if zh else "Which aligned receptors?", exact=True
        )
        expect(choices).to_contain_text(job.request.name)
        choices.select_option(str(ensemble.id))
        form = page.get_by_role(
            "region", name="指定搜索区域" if zh else "Define search regions", exact=True
        )
        next_button = form.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_disabled()
        form.get_by_role("checkbox", name=re.compile("^受体 1" if zh else "^Receptor 1")).check()
        next_button.click()
        expect(
            form.get_by_role("radio", name="上传新文件" if zh else "Upload a new file", exact=True)
        ).to_be_checked()
        form.locator('input[type="file"]').set_input_files(LIGAND)
        form.get_by_role(
            "button", name="使用此参考配体" if zh else "Use this reference ligand", exact=True
        ).click()
        expect(next_button).to_be_enabled()
        form.get_by_role(
            "button", name="为此受体添加区域" if zh else "Add region for this receptor", exact=True
        ).click()
        form.get_by_role(
            "combobox", name="在哪里搜索？" if zh else "Where should the search run?", exact=True
        ).select_option("box")
        for axis, value, length in zip("XYZ", center, size, strict=True):
            form.get_by_role(
                "spinbutton", name=f"{'中心' if zh else 'Center'} {axis} (Å)", exact=True
            ).fill(str(value))
            form.get_by_role(
                "spinbutton", name=f"{'边长' if zh else 'Length'} {axis} (Å)", exact=True
            ).fill(str(length))
        view = form.locator(".structure-workbench-view")
        expect(
            view.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True)
        ).to_be_enabled(timeout=30000)
        canvas = view.locator(".molecular-stage").bounding_box()
        right = form.locator(".structure-workbench-details").bounding_box()
        assert canvas and right and canvas["height"] >= (500 if width > 1000 else 340)
        assert canvas["x"] < right["x"] if width > 1000 else canvas["y"] < right["y"]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        page.screenshot(path=evidence / "manual-bounds.png", full_page=True)
        next_button.click()
        expect(next_button).to_be_disabled()
        form.get_by_role(
            "combobox", name="当前区域" if zh else "Current region", exact=True
        ).select_option("0")
        form.get_by_role(
            "checkbox", name=re.compile("确认此参考配体" if zh else "This reference ligand uses")
        ).check()
        next_button.click()
        review = form.get_by_role(
            "table", name="搜索区域与材料" if zh else "Search regions and materials", exact=True
        )
        expect(review).to_contain_text(LIGAND.name)
        page.screenshot(path=evidence / "review.png", full_page=True)
        with page.expect_response(
            lambda r: r.request.method == "POST" and r.url.endswith("/api/research/site-sets")
        ) as response:
            form.get_by_role(
                "button", name="保存搜索区域" if zh else "Save search regions", exact=True
            ).click()
        assert response.value.status == 201
        saved = response.value.json()
        assert saved["schema_version"] == 2 and len(saved["sites"]) == 2
        assert "observations" not in saved and "groups" not in saved
        assert saved["request"]["regions"][0]["search"]["coordinate_basis"] == "user_confirmed"
        assert saved["request"]["regions"][1]["search"]["box"] == {
            "center": center,
            "size": size,
            "unit": "angstrom",
        }
        assert all(
            row["search"]["frame"] == ensemble.members[0].reference.model_dump(mode="json")
            for row in saved["request"]["regions"]
        )
        form.get_by_role(
            "button",
            name="用这些区域探索结合姿势" if zh else "Explore poses in these regions",
            exact=True,
        ).click()
        site_choices = page.get_by_role(
            "checkbox", name=re.compile("^受体 1 ·" if zh else "^Receptor 1 ·")
        )
        expect(site_choices).to_have_count(2)
        for checkbox in site_choices.all():
            checkbox.check()
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        next_button.click()
        page.get_by_role("radio", name="历史文件" if zh else "Historical files", exact=True).check()
        ligand_picker = page.get_by_role(
            "combobox",
            name=re.compile(
                "选择探索分子 · 历史文件" if zh else "Choose exploration ligand · Historical files"
            ),
        )
        expect(ligand_picker).to_be_enabled()
        ligand_reference = saved["request"]["regions"][0]["search"]["reference"]
        ligand_picker.select_option("version:" + ligand_reference["version_id"])
        expect(next_button).to_be_enabled()
        next_button.click()
        next_button.click()
        with page.expect_response(
            lambda r: (
                r.request.method == "POST" and r.url.endswith("/api/research/pose-explorations")
            )
        ) as compiled:
            page.get_by_role(
                "button",
                name="保存并审阅探索计划" if zh else "Save and review exploration plan",
                exact=True,
            ).click()
        assert compiled.value.status == 201
        exploration = compiled.value.json()
        assert len(exploration["combinations"]) == 2
        assert all(
            c["source_kind"] == "defined_search" and "pocket_rank" not in c
            for c in exploration["combinations"]
        )
        plan = page.request.get(base + "/api/workflows/plans/" + exploration["plan_id"]).json()
        assert [step["request"]["search"] for step in plan["body"]["steps"]] == [
            row["search"] for row in saved["request"]["regions"]
        ]
        page.screenshot(path=evidence / "exploration-handoff.png", full_page=True)
        assert not scientific_posts and not errors, (scientific_posts, errors)
        browser.close()
    assert {row.id: row.status for row in store.list_jobs()} == before
    (evidence / "acceptance.json").write_text(
        json.dumps(
            {
                "language": language,
                "width": width,
                "native_alignment": ALIGNMENT,
                "saved_conditions": saved,
                "compiled_exploration": exploration,
                "new_scientific_jobs": 0,
                "whole_product_acceptance": False,
            },
            indent=2,
        )
    )
