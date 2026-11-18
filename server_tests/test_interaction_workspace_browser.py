"""Actual saved PLIP rows, precise native residue focus and immutable downloads."""

import csv
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize(
    "language,width,height", [("en", 1440, 1000), ("zh", 390, 775), ("en", 320, 568)]
)
def test_saved_native_contact_workspace(interaction_workspace, language, width, height):
    evidence = Path("outputs/interaction-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": width, "height": height})
            page.add_init_script(
                f"if (location.origin === {json.dumps(base)}) {{"
                f"localStorage.setItem('opendde-workbench.language','{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda req: writes.append(req.url)
                    if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
            info = page.request.get(base + "/api/examples/plip.profile").json()
            pin = info["pin"]
            assert pin and pin["case_id"] == "stat6-defined-molecules"
            identifier = pin["job_id"]
            result = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            assert result["program"] == "plip" and len(result["interactions"]) == 11
            artifact = result["structure_artifact"]
            structure_url = base + f"/api/jobs/{identifier}/download?name=" + quote(
                artifact, safe=""
            )
            original_structure = page.request.get(structure_url).body()
            structure_sha = hashlib.sha256(original_structure).hexdigest()
            assert structure_sha == pin["artifact_sha256"][artifact]
            original_csv = page.request.get(
                base + f"/api/jobs/{identifier}/download?name=interactions.csv"
            ).body()
            before = page.request.get(base + "/api/jobs").json()
            fail_source = re.compile(re.escape(structure_url) + "$")
            page.route(fail_source, lambda route: route.fulfill(status=503, body="Unavailable"))
            page.goto(base)
            navigation = open_navigation(page, language)
            navigation.get_by_role(
                "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
            ).click()
            picker = page.get_by_role(
                "combobox", name="研究任务" if zh else "Research task", exact=True
            )
            picker.select_option("plip.profile")
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            workspace = page.locator(".interaction-results")
            expect(workspace).to_be_visible(timeout=15000)
            panel = workspace.locator(".viewer-panel")
            expect(panel.locator(".viewer-error")).to_be_visible(timeout=30000)
            row = workspace.get_by_role("row", name=re.compile("A:ARG562"))
            expect(row).not_to_have_attribute("tabindex", "0")
            page.unroute(fail_source)
            panel.locator(".viewer-error").get_by_role(
                "button", name="重新加载" if zh else "Reload"
            ).click()
            expect(row).to_have_attribute("tabindex", "0", timeout=30000)
            expect(picker).to_be_hidden()
            expect(workspace.locator(".interaction-result-method")).to_contain_text(
                result["version"]
            )
            original_frame = panel.locator("iframe").element_handle()
            original_camera = panel.locator("iframe").evaluate(
                "el => el.contentDocument.querySelector('canvas')._3dmol_viewer.getView()"
            )
            selection = panel.get_by_role(
                "group", name="当前结构选择" if zh else "Current structure selection"
            )
            show_contacts = workspace.get_by_role(
                "button", name="查看相互作用" if zh else "Review interactions", exact=True
            )
            show_tools = workspace.get_by_role(
                "button",
                name="视图工具与导出" if zh else "View tools for display and export",
                exact=True,
            )
            if width <= 600:
                expect(show_tools).to_have_attribute("aria-expanded", "false")
                expect(workspace.locator(".viewer-heading-actions")).to_be_hidden()
                show_contacts.press("Enter")
                expect(workspace.locator(".interaction-review-region")).to_be_focused()
                assert workspace.locator("tbody tr").first.evaluate(
                    "el => {const r=el.getBoundingClientRect(); return r.top >= 132 "
                    "&& r.bottom <= innerHeight}"
                )
                back = workspace.get_by_role(
                    "button", name="返回三维 ↑" if zh else "Back to 3D ↑", exact=True
                )
                back.press("Enter")
                expect(workspace.locator(".interaction-preview-region")).to_be_focused()
                expect(show_tools).to_be_in_viewport()
                assert panel.locator("iframe").evaluate(
                    "el => el.contentDocument.querySelector('canvas')._3dmol_viewer.getView()"
                ) == original_camera
                show_contacts.press("Enter")
                filter_contacts = workspace.get_by_role("searchbox")
                filter_contacts.fill("ARG562")
                row.press("Enter")
                expect(row).to_have_attribute("aria-selected", "true")
                back.press("Enter")
                expect(workspace.locator(".interaction-preview-region")).to_be_focused()
                expect(selection.get_by_text("A:ARG562", exact=True)).to_be_visible()
                expect(filter_contacts).to_have_value("ARG562")
                filter_contacts.fill("")
                show_tools.click()
                expect(show_tools).to_have_attribute("aria-expanded", "true")
                expect(workspace.locator(".viewer-heading-actions")).to_be_visible()
            else:
                expect(show_contacts).to_have_count(0)
                expect(show_tools).to_have_count(0)
            row.click()
            expect(row).to_have_attribute("aria-selected", "true")
            expect(selection.get_by_text("A:ARG562", exact=True)).to_be_visible()
            panel.get_by_role(
                "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
            ).click()
            board = page.locator(".structure-workbench[data-workspace-expanded]")
            expect(board).to_be_visible()
            if width <= 600:
                expanded_back = board.get_by_role(
                    "button", name="返回三维 ↑" if zh else "Back to 3D ↑", exact=True
                )
                expanded_back.scroll_into_view_if_needed()
                expanded_back.press("Enter")
                expect(board).to_be_visible()
                expect(board.locator(".interaction-preview-region")).to_be_focused()
                expect(panel.locator("iframe")).to_be_in_viewport()
            page.keyboard.press("Escape")
            expect(page.locator(".structure-workbench[data-workspace-expanded]")).to_have_count(0)
            expect(row).to_have_attribute("aria-selected", "true")
            expect(selection.get_by_text("A:ARG562", exact=True)).to_be_visible()
            other = workspace.get_by_role("row", name=re.compile("A:PHE592"))
            other.focus()
            other.press("Enter")
            expect(other).to_have_attribute("aria-selected", "true")
            expect(selection.get_by_text("A:PHE592", exact=True)).to_be_visible()
            search = workspace.get_by_role("searchbox")
            search.fill("ARG562")
            expect(workspace.locator("tbody tr")).to_have_count(1)
            row.click()
            expect(selection.get_by_text("A:ARG562", exact=True)).to_be_visible()
            label = row.locator(".interaction-residue")
            assert label.evaluate("node => getComputedStyle(node).whiteSpace") == "nowrap"
            assert panel.locator("iframe").evaluate(
                "(node, prior) => node === prior", original_frame
            )
            with page.expect_download() as transfer:
                workspace.get_by_role(
                    "button", name="导出筛选结果" if zh else "Export filtered rows"
                ).click()
            filtered = evidence / "filtered.csv"
            transfer.value.save_as(filtered)
            with filtered.open(encoding="utf-8-sig", newline="") as stream:
                filtered_rows = list(csv.DictReader(stream))
            assert len(filtered_rows) == 1
            assert filtered_rows[0]["残基" if zh else "Residue"] == "A:ARG562"
            expected_contact = next(row for row in result["interactions"]
                                    if row["chain"] == "A" and row["number"] == 562)
            distance_column = "端点距离（Å）" if zh else "Endpoint distance (Å)"
            assert float(filtered_rows[0][distance_column]) == expected_contact["distance"]
            with page.expect_download() as transfer:
                workspace.get_by_role(
                    "link", name="下载相互作用表" if zh else "Download interaction table"
                ).click()
            complete = evidence / "native-interactions.csv"
            transfer.value.save_as(complete)
            assert complete.read_bytes() == original_csv
            search.fill("")
            expect(workspace.locator("tbody tr")).to_have_count(11)
            figure = export_figure(
                page, panel.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓"),
                evidence, "selected-native-residue", language,
            )
            inspect_png(figure)
            expect(selection.get_by_text("A:ARG562", exact=True)).to_be_visible()
            bounds = workspace.locator(".structure-workbench").bounding_box()
            stage = panel.locator("iframe").bounding_box()
            details = workspace.locator(".structure-workbench-details").bounding_box()
            assert bounds and stage and details and stage["height"] >= 300
            if width > 1000:
                assert stage["x"] < details["x"] and stage["width"] > details["width"]
                assert workspace.locator(".research-table-scroll").evaluate(
                    "node => node.scrollWidth <= node.clientWidth + 1"
                )
                sequence_bounds = workspace.locator(".structure-workbench-sequence").bounding_box()
                assert sequence_bounds and abs(sequence_bounds["x"] - details["x"]) < 2
                assert sequence_bounds["height"] <= 113
            else:
                assert details["y"] >= stage["y"] + stage["height"]
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=evidence / "workspace.png")
            assert page.request.get(structure_url).body() == original_structure
            assert page.request.get(base + "/api/jobs").json() == before
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(picker).to_be_visible()
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "job": identifier, "contacts": len(result["interactions"]),
                "structure_sha256": hashlib.sha256(original_structure).hexdigest(),
                "csv_sha256": hashlib.sha256(original_csv).hexdigest(), "width": width,
                "source_failure_recovered": True,
                "row_to_native_selection": ["A:ARG562", "A:PHE592"],
                "same_iframe": True, "errors": errors, "writes": writes, "scientific_tasks": 0,
            }, indent=2))
            browser.close()
