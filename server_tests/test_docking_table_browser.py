"""Native STAT6 candidate comparison; presentation changes retain every original metric."""

import csv
import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.fullscreen_browser_helpers import inspect_full_workspace
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_workspace_fullscreen_browser import (
    restored_workspace as restored_workspace,
)

PAIRED_STAGE = '.simulation-webgl[data-loaded="true"][aria-busy="false"]'


def inspect_paired_poses(page, workspace, comparison, opener, sources, hashes, evidence):
    pair = comparison.get_by_role("button", name="A / B side by side", exact=True)
    overlay = comparison.get_by_role("button", name="Overlay", exact=True)
    controls = comparison.locator("[data-workspace-expand]")
    stages = comparison.locator(PAIRED_STAGE)
    pair.click()
    expect(stages).to_have_count(2, timeout=45000)
    for index, slot in enumerate(("A", "B"), start=1):
        pane = comparison.get_by_role("region", name=f"{slot} · Pose {index}", exact=True)
        viewport = pane.get_by_test_id("molstar-viewport")
        expect(viewport).to_have_attribute("data-ligand", slot.lower())
        link = pane.get_by_role("link", name=f"Download Pose {index} SDF", exact=True)
        expect(link).to_have_attribute("href", sources[index])
        with page.expect_download() as pending:
            link.click()
        path = evidence / f"paired-pose-{index}.sdf"
        pending.value.save_as(path)
        assert hashlib.sha256(path.read_bytes()).hexdigest() == hashes[index - 1]
    expect(controls).to_have_count(1)
    controls.click()
    before = stages.first.bounding_box()
    assert before
    comparison.get_by_role("button", name="Focus structure", exact=True).click()
    details = workspace.locator(":scope > .structure-workbench-details")
    expect(details).to_be_hidden()
    rects = [stage.bounding_box() for stage in stages.all()]
    assert all(rect and rect["width"] > before["width"] * 1.25 for rect in rects)
    assert abs(rects[0]["y"] - rects[1]["y"]) < 2
    assert abs(rects[0]["height"] - rects[1]["height"]) < 2
    overlay.click()
    expect(comparison.locator(".molecular-stage")).to_be_visible()
    expect(workspace).to_have_attribute("data-workspace-focus", "true")
    pair.click()
    expect(stages).to_have_count(2, timeout=45000)
    expect(workspace).to_have_attribute("data-workspace-focus", "true")
    comparison.get_by_role("button", name="Match views", exact=True).click()
    export = comparison.get_by_role("button", name="Export comparison ↓", exact=True)
    inspect_png(export_figure(page, export, evidence, "focused-docking-comparison", "en"))
    expect(controls).to_have_count(1)
    page.screenshot(path=evidence / "focused-a-b.png")
    comparison.get_by_role("button", name="Return to single pose", exact=True).click()
    expect(comparison).to_have_count(0)
    single = workspace.locator(".viewer-panel [data-workspace-expand]")
    expect(single).to_be_focused()
    expect(workspace).to_have_attribute("data-workspace-focus", "true")
    page.keyboard.press("Escape")
    expect(details).to_be_visible()
    opener.press("Enter")
    expect(overlay).to_have_attribute("aria-pressed", "true")


def inspect_desktop_rail(page, workspace):
    rail = workspace.locator(".structure-workbench-toolbar")
    view = workspace.locator(".structure-workbench-view")
    details = workspace.locator(".structure-workbench-details")
    rail_box, view_box, details_box = (
        panel.bounding_box() for panel in (rail, view, details)
    )
    assert rail_box and view_box and details_box
    assert abs(view_box["y"] - rail_box["y"]) <= 1
    assert abs(rail_box["x"] - details_box["x"]) <= 1
    assert abs(rail_box["width"] - details_box["width"]) <= 1
    assert view_box["x"] + view_box["width"] <= rail_box["x"]
    assert view_box["width"] > details_box["width"]
    expect(view.locator(".molecular-stage")).to_have_css("border-top-left-radius", "10px")
    units = details.locator("tbody tr").first.locator(".numeric-cell .evidence-description")
    expect(units).to_have_count(2)
    for unit in units.all():
        expect(unit).to_have_css("white-space", "normal")
        assert unit.evaluate("""note => {
          const cell = note.closest('td').getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(note);
          const lines = Array.from(text.getClientRects());
          return lines.length > 0 && lines.every(rect =>
            rect.left >= cell.left - 1 && rect.right <= cell.right + 1
          );
        }"""), "Model-output note runs outside its metric cell"
    next_pose = rail.get_by_role("button", name="Next candidate").bounding_box()
    assert next_pose and next_pose["x"] + next_pose["width"] <= rail_box["x"] + rail_box["width"]
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_native_docking_core_metrics_optional_details_and_unchanged_downloads(
    restored_workspace, language, width
):
    settings, store, pins = restored_workspace
    pin = pins.get("gnina.dock", verify=True)
    assert pin
    # Current sealed user-warhead case; never silently accept an older case's count/methods.
    assert str(pin.job_id) == "cf623a70-e687-47d1-9727-4433dc6429b5"
    evidence = Path("outputs/docking-table") / language
    evidence.mkdir(parents=True, exist_ok=True)
    before = {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        height = 775 if width < 600 else 850
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.add_init_script("""window.addEventListener('message', event => {
          if (event.data?.channel === 'opendde-viewer' && event.data.type === 'load')
            window.__reviewedPoseLoad = event.data.value;
        });""")
        response = page.request.get(base + "/api/jobs/" + str(pin.job_id) + "/result")
        assert response.ok
        original = response.json()
        assert len(original["poses"]) == 9
        assert all(
            pose["valid"] and not pose.get("constraint_checks") for pose in original["poses"]
        )
        assert all(
            {(score["name"], score["unit"], score["direction"]) for score in pose["scores"]}
            == {
                ("minimizedAffinity", "kcal/mol", "lower"),
                ("CNNscore", "model_output", "higher"),
                ("CNNaffinity", "model_output", "higher"),
            }
            for pose in original["poses"]
        )
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
        page.goto(base + "/#task=" + str(pin.job_id))
        workspace = page.locator(".docking-results .structure-workbench")
        viewer = workspace.locator(".viewer-panel")
        table = workspace.get_by_role(
            "table", name="GNINA " + original["software_version"], exact=True
        )
        export = viewer.get_by_role(
            "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓", exact=True
        )
        expect(export).to_be_enabled(timeout=45000)
        initial = viewer.locator(".molecular-stage iframe").bounding_box()
        assert initial and initial["y"] < (625 if width < 600 else 415), initial
        if width >= 1180:
            page.set_viewport_size({"width": 1280, "height": 720})
            inspect_desktop_rail(page, workspace)
            page.screenshot(path=evidence / "desktop-rail-1280.png")
            page.set_viewport_size({"width": width, "height": height})
        mapping = "原子映射" if language == "zh" else "Atom mapping"
        status = "状态" if language == "zh" else "Status"
        pose_label = "姿势" if language == "zh" else "Pose"
        energy = (
            "经验对接分数 (kcal/mol)" if language == "zh" else "Empirical docking score (kcal/mol)"
        )
        score_labels = {
            "minimizedAffinity": energy,
            "CNNscore": "模型姿势分数" if language == "zh" else "CNN pose score",
            "CNNaffinity": "模型结合分数" if language == "zh" else "CNN binding score",
        }
        selected = original["poses"][1]

        def inspect():
            expect(table.get_by_role("columnheader")).to_have_count(5)
            expect(table.get_by_role("columnheader", name=mapping, exact=True)).to_have_count(0)
            expect(table.get_by_role("columnheader", name=status, exact=True)).to_have_count(0)
            row = table.locator("tbody tr").nth(1)
            strip = workspace.get_by_role(
                "region", name="姿势预览选择" if language == "zh" else "Pose preview selection"
            )
            preview = strip.get_by_role(
                "button", name="预览姿势 2" if language == "zh" else "Preview pose 2"
            )
            preview.click()
            expect(preview).to_have_attribute("aria-pressed", "true")
            expect(row).to_have_attribute("aria-selected", "true")
            scores = workspace.get_by_role(
                "region", name="所选姿势分数" if language == "zh" else "Selected pose scores"
            )
            for score in selected["scores"]:
                expect(scores).to_contain_text(f"{score['value']:.3f}")
            expect(export).to_be_enabled(timeout=30000)
            expect(workspace.get_by_role("note")).to_have_count(1)
            with page.expect_download() as download:
                workspace.get_by_role(
                    "button",
                    name="导出筛选结果" if language == "zh" else "Export filtered rows",
                    exact=True,
                ).click()
            csv_path = evidence / "native-all-metrics.csv"
            download.value.save_as(csv_path)
            rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8-sig").splitlines()))
            assert len(rows) == len(original["poses"])
            for exported, pose in zip(rows, original["poses"], strict=True):
                assert exported[pose_label] == pose_label + " " + str(pose["record"] + 1)
                for score in pose["scores"]:
                    assert float(exported[score_labels[score["name"]]]) == score["value"]
                assert exported[mapping] == pose["mapping_status"]
                assert exported[status] == str(pose["valid"]).lower()
            choices = workspace.locator(".table-columns")
            choices.locator("summary").click()
            choices.get_by_role("checkbox", name=mapping, exact=True).check()
            choices.get_by_role("checkbox", name=status, exact=True).check()
            expect(table.get_by_role("columnheader")).to_have_count(7)
            page.screenshot(path=str(evidence / "optional-details.png"))
            choices.get_by_role(
                "button", name="常用指标" if language == "zh" else "Core metrics", exact=True
            ).click()
            expect(table.get_by_role("columnheader")).to_have_count(5)
            choices.locator("summary").click()
            expect(row).to_have_attribute("aria-selected", "true")
            link = workspace.get_by_role(
                "link",
                name="下载所选姿势 SDF" if language == "zh" else "Download selected pose SDF",
                exact=True,
            )
            with page.expect_download() as pose_download:
                link.click()
            target = evidence / "selected-native-pose.sdf"
            pose_download.value.save_as(target)
            assert (
                hashlib.sha256(target.read_bytes()).hexdigest()
                == pin.artifact_sha256[selected["artifact"]]
            )

        geometry = inspect_full_workspace(
            page, viewer, evidence, language, "core-metrics", inspect, changes_source=True
        )
        if width >= 1180:
            inspect_desktop_rail(page, workspace)
        expect(table.locator('tr[aria-selected="true"]')).to_contain_text(pose_label + " 2")
        # This is the same retained search, never fitted or submitted to another engine.
        for number in (1, 2):
            table.get_by_role(
                "checkbox",
                name=("对比 " if language == "zh" else "Compare ") + pose_label + f" {number}",
                exact=True,
            ).check()
        opener = workspace.get_by_role(
            "button",
            name="三维比较两个姿势" if language == "zh" else "Compare two poses in 3D",
            exact=True,
        )
        expect(workspace.get_by_role(
            "region", name="结果对比" if language == "zh" else "Result comparison"
        )).to_have_count(0)
        opener.press("Enter")
        overlay = workspace.get_by_role(
            "region",
            name="结合姿势三维比较" if language == "zh" else "Binding pose structural comparison",
            exact=True,
        )
        expect(overlay).to_be_visible()
        expect(export).to_be_enabled(timeout=30000)
        expect(overlay.get_by_role(
            "heading", name="结合姿势比较" if language == "zh" else "Compare binding poses"
        )).to_be_focused()
        expect(overlay.locator(".molecular-stage iframe")).to_be_in_viewport(ratio=0.65)
        page.screenshot(path=evidence / "direct-overlay.png")
        native_scene = overlay.locator(".molecular-stage iframe").element_handle()
        assert native_scene
        opener.press("Enter")
        assert native_scene.evaluate("(frame) => frame.isConnected")
        expect(overlay.get_by_role(
            "heading", name="结合姿势比较" if language == "zh" else "Compare binding poses"
        )).to_be_focused()
        expect(overlay.locator(".molecular-stage iframe")).to_be_in_viewport(ratio=0.65)
        load = (
            overlay.frame_locator("iframe")
            .locator("#molecule")
            .evaluate("() => window.__reviewedPoseLoad")
        )
        assert load["comparison"] and load["initialPosePrepared"]
        assert load["focusModels"] == [1, 2] and load["records"] == [0, 0, 0]
        assert len(load["urls"]) == 3
        from urllib.parse import parse_qs, urlparse

        assert [parse_qs(urlparse(url).query)["name"][0] for url in load["urls"]] == [
            original["receptor_artifact"],
            original["poses"][0]["artifact"],
            selected["artifact"],
        ]
        assert all(str(pin.job_id) in url for url in load["urls"])
        expect(overlay.locator(".pose-score")).to_have_count(0)
        expect(
            overlay.get_by_role(
                "checkbox",
                name="显示相互作用" if language == "zh" else "Show interactions",
                exact=True,
            )
        ).to_have_count(0)
        links = overlay.get_by_role(
            "link", name="下载 SDF" if language == "zh" else "Download SDF", exact=True
        )
        expect(links).to_have_count(2)
        for index in range(2):
            with page.expect_download() as pose_download:
                links.nth(index).click()
            target = evidence / f"overlay-pose-{index + 1}.sdf"
            pose_download.value.save_as(target)
            assert (
                hashlib.sha256(target.read_bytes()).hexdigest()
                == pin.artifact_sha256[original["poses"][index]["artifact"]]
            )
        overlay_geometry = inspect_full_workspace(
            page, viewer, evidence, language, "two-pose-overlay"
        )
        if width >= 1180:
            inspect_paired_poses(
                page, workspace, overlay, opener, load["urls"],
                [pin.artifact_sha256[pose["artifact"]] for pose in original["poses"][:2]],
                evidence,
            )
        overlay.get_by_role(
            "button",
            name="返回单个姿势" if language == "zh" else "Return to single pose",
            exact=True,
        ).click()
        expect(overlay).to_have_count(0)
        expect(opener).to_be_focused()
        expect(export).to_be_enabled(timeout=30000)
        expect(opener).to_be_in_viewport(ratio=1)
        expect(
            workspace.get_by_role(
                "link",
                name="下载所选姿势 SDF" if language == "zh" else "Download selected pose SDF",
                exact=True,
            )
        ).to_have_attribute("href", load["urls"][2])
        opener.press("Enter")
        table.get_by_role(
            "checkbox",
            name=("对比 " if language == "zh" else "Compare ") + pose_label + " 2",
            exact=True,
        ).uncheck()
        overlay.get_by_role(
            "button",
            name="返回单个姿势" if language == "zh" else "Return to single pose",
            exact=True,
        ).click()
        search = workspace.get_by_role("searchbox")
        expect(search).to_be_focused()
        expect(export).to_be_enabled(timeout=30000)
        expect(search).to_be_in_viewport(ratio=1)
        expect(table.locator('tr[aria-selected="true"]')).to_contain_text(pose_label + " 2")
        quality = workspace.get_by_role(
            "region",
            name="所选姿势的独立质控"
            if language == "zh"
            else "Independent quality for selected pose",
            exact=True,
        )
        report_ids = [str(entry.job_id) for entry in pin.supporting_evidence]
        assert len(report_ids) == 2
        for number, report_id in zip((3, 9), report_ids, strict=True):
            table.get_by_role("button", name=f"{pose_label} {number}", exact=True).click()
            expect(quality.get_by_role("heading")).to_contain_text(
                f"{pose_label.lower() if language == 'en' else pose_label} {number}"
            )
            expect(quality).to_contain_text("15 通过" if language == "zh" else "15 passed")
            expect(quality).to_contain_text("6 未评估" if language == "zh" else "6 not assessed")
            expect(quality).to_contain_text("1 不适用" if language == "zh" else "1 not applicable")
            report_link = quality.get_by_role(
                "link",
                name="查看报告 · PoseBusters 0.6.5"
                if language == "zh"
                else "View report · PoseBusters 0.6.5",
            )
            expect(report_link).to_have_attribute("href", "/#task=" + report_id)
            expect(export).to_be_enabled(timeout=30000)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            if number == 3:
                quality.scroll_into_view_if_needed()
                page.screenshot(path=evidence / "selected-pose-independent-quality.png")
                with page.expect_popup() as opened:
                    report_link.click()
                report_page = opened.value
                expect(
                    report_page.get_by_role(
                        "region",
                        name="构象与姿势质控结果" if language == "zh" else "Pose quality results",
                        exact=True,
                    )
                ).to_be_visible(timeout=30000)
                report_page.close()
                expect(table.locator('tr[aria-selected="true"]')).to_contain_text(f"{pose_label} 3")

        table.get_by_role("button", name=f"{pose_label} 1", exact=True).click()
        expect(quality.get_by_role("link")).to_have_count(0)
        expect(quality).to_contain_text(
            "没有关联的独立质控报告"
            if language == "zh"
            else "No independent quality report is linked"
        )
        complete = page.locator(".docking-results > details").last
        complete.locator("summary").click()
        with page.expect_download() as full_download:
            complete.get_by_role(
                "link", name="完整姿势集" if language == "zh" else "Complete pose set", exact=True
            ).click()
        full_path = evidence / "complete-native-pose-set.sdf"
        full_download.value.save_as(full_path)
        assert (
            hashlib.sha256(full_path.read_bytes()).hexdigest()
            == pin.artifact_sha256[original["pose_artifact"]]
        )
        assert full_path.read_bytes().count(b"$$$$") == len(original["poses"])
        assert not errors and not writes, {"errors": errors, "writes": writes}
        assert {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)} == before
        assert pins.get("gnina.dock", verify=True) == pin
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "source_job": str(pin.job_id),
                    "language": language,
                    "geometry": geometry,
                    "two_pose_overlay_geometry": overlay_geometry,
                    "overlay_sources": load,
                    "both_pose_downloads_match_native_sha256": True,
                    "default_columns": 4,
                    "optional_columns_reachable": True,
                    "csv_rows": len(original["poses"]),
                    "all_original_metrics_and_units_retained": True,
                    "selected_pose_download_matches_native_sha256": True,
                    "complete_pose_set_matches_native_sha256": True,
                    "original_pose_quality_reports_match": True,
                    "source_pins_unchanged": True,
                    "new_scientific_tasks": 0,
                    "errors": errors,
                    "api_mutations": writes,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
