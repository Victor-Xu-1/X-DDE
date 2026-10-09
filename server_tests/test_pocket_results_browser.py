"""Inspect retained native BRD4 pockets; never predict, prepare or submit science."""

import csv
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlencode

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import settings
from server_tests.test_template_controls_browser import open_case

EVIDENCE = Path("server_tests/evidence/pocket-results")


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_native_pocket_selection_handoff_and_downloads_stay_exact(language, width):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"]
    prefix = f"{language}-{width}"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors, mutations = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: mutations.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base)
        expect(page.locator("html")).to_have_attribute("lang", "en")
        before_jobs = page.request.get(base + "/api/jobs").json()
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        toolbar = open_case(page, language, "p2rank.detect", ("口袋与对接", "Pockets and docking"))
        info = page.request.get(base + "/api/examples/p2rank.detect").json()
        job_id = info["pin"]["job_id"]
        native_url = base + f"/api/jobs/{job_id}/result"
        native = page.request.get(native_url).json()
        assert native["operation"] == "pocket_search" and len(native["pockets"]) >= 2
        original_url = (
            base + f"/api/jobs/{job_id}/download?" + urlencode({"name": native["protein_artifact"]})
        )
        original = page.request.get(original_url).body()
        toolbar.get_by_role(
            "button", name="示例结果" if language == "zh" else "Example results", exact=True
        ).click()
        viewer = page.locator(".pocket-explorer .viewer-panel")
        expect(viewer).to_be_visible()
        expect(
            viewer.get_by_role(
                "button",
                name="生成三维视图图片" if language == "zh" else "Capture 3D view",
                exact=True,
            )
        ).to_be_enabled(timeout=30000)
        frame = viewer.frame_locator("iframe")
        expect(frame.locator("canvas").first).to_be_visible()
        selection = page.locator(".pocket-selection")
        expect(selection).to_be_visible()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        selected_bounds, viewer_bounds = selection.bounding_box(), viewer.bounding_box()
        if width == 1440:
            assert selected_bounds["x"] + selected_bounds["width"] <= viewer_bounds["x"]
            assert selected_bounds["y"] < viewer_bounds["y"] + viewer_bounds["height"]
        else:
            assert selected_bounds["y"] + selected_bounds["height"] <= viewer_bounds["y"]
        page.screenshot(path=str(EVIDENCE / f"{prefix}-pockets.png"))
        table = page.locator(".pocket-candidates .research-table")
        with page.expect_download() as download:
            table.get_by_role(
                "button",
                name="导出筛选结果" if language == "zh" else "Export filtered rows",
                exact=True,
            ).click()
        table_path = EVIDENCE / f"{prefix}-native-pockets.csv"
        download.value.save_as(table_path)
        rows = list(csv.reader(table_path.read_text(encoding="utf-8-sig").splitlines()))
        assert len(rows) == len(native["pockets"]) + 1
        for row, site in zip(rows[1:], native["pockets"], strict=True):
            assert int(row[0]) == site["rank"]
            assert float(row[1]) == site["probability"]
            assert float(row[2]) == site["score"]
            assert int(row[3]) == len(site["residues"])
        site = native["pockets"][1]
        control = table.get_by_role(
            "button",
            name=("口袋 " if language == "zh" else "Pocket ") + str(site["rank"]),
            exact=True,
        )
        control.focus()
        page.keyboard.press("Enter")
        expect(control).to_have_attribute("aria-pressed", "true")
        expect(selection.get_by_role("heading")).to_have_text(
            ("口袋 " if language == "zh" else "Pocket ") + str(site["rank"])
        )
        selection.locator("summary").click()
        expected_labels = [
            f"{r['chain']}:{r['number']}{r['insertion_code']}" for r in site["residues"]
        ]
        assert selection.locator("li").all_text_contents() == expected_labels
        expect(
            viewer.get_by_text(
                ("已定位区域残基：" if language == "zh" else "Region residues located: ")
                + f"{len(site['residues'])} / {len(site['residues'])}",
                exact=True,
            )
        ).to_be_visible(timeout=30000)
        page.screenshot(path=str(EVIDENCE / f"{prefix}-selected-pocket.png"))
        if width == 1440:
            figure = export_figure(
                page,
                viewer.get_by_role(
                    "button",
                    name="文献图导出 ↓" if language == "zh" else "Export figure ↓",
                    exact=True,
                ),
                EVIDENCE,
                f"{prefix}-native-pocket-figure",
                language,
            )
            inspect_png(figure)
        viewer.locator(".viewer-original-downloads > summary").click()
        with page.expect_download() as download:
            viewer.get_by_role(
                "link", name="结构 1" if language == "zh" else "Structure 1", exact=True
            ).click()
        structure_path = EVIDENCE / f"{prefix}-original-protein.pdb"
        download.value.save_as(structure_path)
        assert structure_path.read_bytes() == original
        selection.get_by_role(
            "button",
            name="探索这个口袋的结合模式" if language == "zh" else "Explore poses in this pocket",
            exact=True,
        ).click()
        expect(page.locator(".task-workspace.is-input .questionnaire")).to_be_visible()
        expect(
            page.locator(".task-workspace.is-input .questionnaire > fieldset:visible")
        ).to_have_count(1)
        page.get_by_role(
            "button", name="← 返回结果" if language == "zh" else "← Back to results", exact=True
        ).click()
        expect(control).to_have_attribute("aria-pressed", "true")
        assert page.request.get(native_url).json() == native
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert not errors and not mutations, {"errors": errors, "mutations": mutations}
        (EVIDENCE / f"{prefix}-acceptance.json").write_text(
            json.dumps(
                {
                    "capability": "p2rank.detect",
                    "job_id": job_id,
                    "selected_rank": site["rank"],
                    "selected_residues": expected_labels,
                    "language": language,
                    "width": width,
                    "source_sha256": hashlib.sha256(original).hexdigest(),
                    "native_scores_and_source_unchanged": True,
                    "keyboard_selection_and_return": True,
                    "scientific_execution": False,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        browser.close()
