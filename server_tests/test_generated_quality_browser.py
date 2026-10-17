"""Retained native generation -> exact quality draft; no new inference or task submission."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_generated_candidate_enters_exact_full_receptor_quality_draft(language, width):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("diffsbdd.generate", verify=True)
    assert pin and pin.case_id == "brd4-jq1", (
        "Archived native files are UI evidence, not STAT6 results"
    )
    job = store.get(str(pin.job_id))
    assert job and job.request.operation == "diffsbdd"
    assert job.request.payload.protein is not None
    receptor_asset = str(job.request.payload.protein.asset_id)
    root = settings.state_dir / "jobs" / job.id / "output"
    result = json.loads((root / "result.json").read_text())
    assert result["valid"] >= 2
    native_row = result["report"]["molecules"][1]
    molecule_digest = hashlib.sha256((root / result["molecule_artifact"]).read_bytes()).hexdigest()
    original = {
        name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in pin.artifact_sha256
    }
    before = {row.id: row.status for row in store.list_jobs(1000)}
    evidence = Path("outputs/generated-quality") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1050})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.add_init_script("""window.__nativeViewerLoads = [];
            window.addEventListener('message', event => {
                if (event.origin === location.origin && event.source === window.parent &&
                    event.data?.channel === 'opendde-viewer' && event.data.type === 'load')
                    window.__nativeViewerLoads.push(structuredClone(event.data.value));
            });""")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base + "/#task=" + job.id)
        table = page.get_by_role(
            "table", name="生成的候选分子" if zh else "Generated candidate molecules", exact=True
        )
        expect(table).to_be_visible(timeout=30000)
        selected = table.get_by_role("button", name="候选 2" if zh else "Candidate 2", exact=True)
        selected.click()
        expect(selected).to_have_attribute("aria-pressed", "true")
        expect(
            table.get_by_role("columnheader", name="输出重原子数" if zh else "Output heavy atoms")
        ).to_be_visible()
        row = table.get_by_role("row").filter(
            has=page.get_by_role("button", name="候选 2" if zh else "Candidate 2", exact=True)
        )
        (evidence / "selected-row.json").write_text(
            json.dumps(
                {
                    "native_output_heavy_atoms": native_row["heavy_atoms"],
                    "visible_table_rows": table.get_by_role("row").all_inner_texts(),
                    "selected_rows": row.count(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        expect(
            row.get_by_role("cell", name=str(native_row["heavy_atoms"]), exact=True)
        ).to_be_visible()
        expect(
            page.get_by_role(
                "status", name="生成片段处理" if zh else "Generation fragment processing"
            )
        ).to_contain_text(str(result["report"]["target_atoms"]))
        workspace = page.locator(".structure-workbench").filter(
            has=page.get_by_role(
                "table",
                name="生成的候选分子" if zh else "Generated candidate molecules",
                exact=True,
            )
        )
        preview = workspace.locator(".structure-workbench-view")
        details = workspace.locator(".structure-workbench-details")
        page.screenshot(path=evidence / "selected-native-view-loading.png", full_page=True)
        expect(preview.locator(".molecular-stage")).to_be_visible(timeout=30000)
        view_box, detail_box = preview.bounding_box(), details.bounding_box()
        assert view_box and detail_box
        if width > 1000:
            assert view_box["x"] + view_box["width"] <= detail_box["x"] + 2
            assert view_box["width"] > detail_box["width"]
        else:
            assert view_box["y"] < detail_box["y"]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        capture = preview.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=30000)
        frame_element = preview.locator(".molecular-stage iframe").element_handle()
        assert frame_element
        molecular_frame = frame_element.content_frame()
        assert molecular_frame
        first_load = molecular_frame.evaluate("window.__nativeViewerLoads.at(-1)")
        assert first_load and 1 in first_load["records"]
        with molecular_frame.expect_navigation(wait_until="load", timeout=30000):
            molecular_frame.evaluate("location.reload()")
        molecular_frame.wait_for_function(
            "window.__nativeViewerLoads?.length > 0", timeout=30000
        )
        expect(capture).to_be_enabled(timeout=30000)
        restored_load = molecular_frame.evaluate("window.__nativeViewerLoads.at(-1)")
        assert restored_load == first_load
        expect(selected).to_have_attribute("aria-pressed", "true")
        page.screenshot(path=evidence / "retained-native-generation.png", full_page=True)
        prepare = details.get_by_role(
            "button", name="准备后续研究材料" if zh else "Prepare for follow-up", exact=True
        )
        if not zh:
            expect(prepare).to_be_visible()
        prepared_missing_materials = prepare.count() > 0
        if prepared_missing_materials:
            prepare.click()
            expect(prepare).to_have_count(0, timeout=30000)
            expect(selected).to_have_attribute("aria-pressed", "true")
        details.get_by_role(
            "button",
            name="检查这个候选的姿势质量" if zh else "Check this candidate's pose quality",
            exact=True,
        ).click()
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        next_button.click()
        expect(
            page.get_by_role(
                "radio", name="蛋白内的结合姿势" if zh else "Pose within a protein", exact=True
            )
        ).to_be_checked()
        next_button.click()
        confirm = page.get_by_role(
            "checkbox",
            name="这些分子姿势与所选蛋白处于同一坐标系"
            if zh
            else "These poses share the selected protein coordinate frame",
            exact=True,
        )
        expect(confirm).not_to_be_checked()
        expect(next_button).to_be_disabled()
        confirm.check()
        next_button.click()
        review = page.get_by_role(
            "table", name="质检材料与方案" if zh else "Quality materials and plan"
        )
        expect(review).to_be_visible()
        ligand = page.get_by_role("row").filter(
            has=page.get_by_role(
                "rowheader", name="研究分子" if zh else "Study molecule", exact=True
            )
        )
        references = page.request.get(
            base + "/api/research/objects?source_job=" + job.id + "&limit=200"
        ).json()
        selected_assets = {
            node["reference"]["asset_id"]
            for node in references
            if node["kind"] == "molecule"
            and node["reference"]["record"] == 1
            and node["reference"]["sha256"] == molecule_digest
        }
        assert len(selected_assets) == 1
        expect(ligand.get_by_role("link")).to_have_attribute(
            "href", "/api/assets/" + selected_assets.pop()
        )
        expect(ligand).to_contain_text("记录 2" if zh else "Record 2")
        receptor = review.get_by_role("row").filter(
            has=page.get_by_role(
                "rowheader", name="对应受体" if zh else "Matching receptor", exact=True
            )
        )
        expect(receptor.get_by_role("link")).to_have_attribute(
            "href", "/api/assets/" + receptor_asset
        )
        page.screenshot(path=evidence / "exact-quality-draft.png", full_page=True)
        page.get_by_role(
            "button", name="← 返回结果" if zh else "← Back to results", exact=True
        ).click()
        expect(
            page.get_by_role("button", name="候选 2" if zh else "Candidate 2", exact=True)
        ).to_have_attribute("aria-pressed", "true")
        assert not errors and not submissions
        browser.close()
    assert {row.id: row.status for row in store.list_jobs(1000)} == before
    assert original == {
        name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in original
    }
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "source_job": job.id,
                "source_case": "brd4-jq1",
                "scope": "Native archive UI and exact quality draft; no inference or STAT6 claim",
                "new_scientific_jobs": 0,
                "prepared_missing_materials": prepared_missing_materials,
                "original_artifacts_unchanged": True,
                "native_iframe_reload_restores_exact_source": True,
                "restored_viewer_load": restored_load,
                "selected_original_record": 1,
                "output_heavy_atoms": native_row["heavy_atoms"],
                "target_atoms": result["report"]["target_atoms"],
                "language": language,
                "width": width,
            },
            indent=2,
        )
    )
