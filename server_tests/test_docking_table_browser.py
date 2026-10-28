"""Native STAT6 candidate comparison; presentation changes retain every original metric."""

import csv
import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.fullscreen_browser_helpers import inspect_full_workspace
from server_tests.test_workspace_fullscreen_browser import (
    restored_workspace as restored_workspace,
)


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
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
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
        table = workspace.locator(".research-table table").first
        export = viewer.get_by_role(
            "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓", exact=True
        )
        expect(export).to_be_enabled(timeout=45000)
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
            row.scroll_into_view_if_needed()
            row.click()
            expect(row).to_have_attribute("aria-selected", "true")
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
        expect(table.locator('tr[aria-selected="true"]')).to_contain_text(pose_label + " 2")
        # This is the same retained search, never fitted or submitted to another engine.
        for number in (1, 2):
            table.get_by_role(
                "checkbox",
                name=("对比 " if language == "zh" else "Compare ") + pose_label + f" {number}",
                exact=True,
            ).check()
        workspace.get_by_role(
            "button", name="对比 (2)" if language == "zh" else "Compare (2)", exact=True
        ).click()
        workspace.get_by_role(
            "button",
            name="三维比较两个姿势" if language == "zh" else "Compare two poses in 3D",
            exact=True,
        ).click()
        overlay = workspace.get_by_role(
            "region",
            name="结合姿势三维比较" if language == "zh" else "Binding pose structural comparison",
            exact=True,
        )
        expect(overlay).to_be_visible()
        expect(export).to_be_enabled(timeout=30000)
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
        overlay.get_by_role(
            "button",
            name="返回单个姿势" if language == "zh" else "Return to single pose",
            exact=True,
        ).click()
        expect(overlay).to_have_count(0)
        expect(export).to_be_enabled(timeout=30000)
        expect(
            workspace.get_by_role(
                "link",
                name="下载所选姿势 SDF" if language == "zh" else "Download selected pose SDF",
                exact=True,
            )
        ).to_have_attribute("href", load["urls"][2])
        expect(table.locator('tr[aria-selected="true"]')).to_contain_text(pose_label + " 2")
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
