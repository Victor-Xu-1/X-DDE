"""Inspect verified retained antibody contacts, never start an analysis engine."""

import csv
import hashlib
import io
import json
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import launch_review_browser, verify_review_fonts
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_exact_epitope_source_and_docked_workspace(interaction_workspace, language, width):
    evidence = Path("outputs/epitope-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = launch_review_browser(driver)
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(
                f"if (location.origin === {json.dumps(base)}) {{"
                f"localStorage.setItem('opendde-workbench.language','{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda req: writes.append(req.url)
                    if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
            info = page.request.get(base + "/api/examples/epitope").json()
            identifier = info["pin"]["job_id"]
            job = page.request.get(base + f"/api/jobs/{identifier}").json()
            native = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            for _ in range(8):
                if "epitope_residues" in native:
                    break
                assert native.get("available") is not False
                assert isinstance(native.get("result"), dict)
                native = native["result"]
            rows = native["epitope_residues"]
            protein = sorted((row for row in rows if row["residue_name"] not in
                              {"HOH", "WAT", "H2O", "DOD"}), key=lambda row: -row["contacts"])
            assert len(protein) == 16 and len(rows) == 18 and native["total_contacts"] == 294
            source = job["request"]["payload"]["structure_path"].removeprefix("asset:")
            source_url = base + "/api/assets/" + source
            original = page.request.get(source_url).body()
            digest = hashlib.sha256(original).hexdigest()
            assert digest == next(ref["sha256"] for ref in job["request"]["scientific_inputs"]
                                  if ref["asset_id"] == source)
            before = page.request.get(base + "/api/jobs").json()
            corrupt = re.compile(re.escape(source_url) + "$")
            page.route(corrupt, lambda route: route.fulfill(
                status=200, body=original + b"\nREMARK controlled preview checksum fault\n"
            ))
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="生物药研究" if zh else "Biologics research", exact=True
            ).click()
            picker = page.get_by_role(
                "combobox", name="研究任务" if zh else "Research task", exact=True
            )
            picker.select_option("epitope")
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            workspace = page.locator(".epitope-results")
            panel = workspace.locator(".viewer-panel")
            table = workspace.get_by_role(
                "table", name="蛋白接触残基" if zh else "Protein contact residues", exact=True
            )
            expect(table.locator("tbody tr")).to_have_count(5)
            first = protein[0]
            label = f"{first['chain']}:{first['residue_name']}{first['residue_id']}"
            contact = table.get_by_role("button", name=label, exact=True)
            expect(panel.locator(".viewer-error")).to_contain_text(
                "已复核的文件" if zh else "reviewed file", timeout=30000
            )
            expect(contact).to_be_disabled()
            page.screenshot(path=evidence / "source-mismatch.png")
            page.unroute(corrupt)
            panel.locator(".viewer-error").get_by_role(
                "button", name="重新加载" if zh else "Reload", exact=True
            ).click()
            expect(contact).to_be_enabled(timeout=30000)
            expect(picker).to_be_hidden()
            sequence = workspace.locator(".structure-workbench-sequence")
            expect(sequence.locator(".structure-sequence")).to_be_visible()
            assert panel.locator(".structure-sequence").count() == 0
            contact.focus()
            contact.press("Enter")
            selection = panel.get_by_role(
                "group", name="当前结构选择" if zh else "Current structure selection"
            )
            expect(selection.get_by_text(label, exact=True)).to_be_visible()
            frame = panel.locator("iframe").element_handle()
            panel.get_by_role(
                "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
            ).click()
            expanded = workspace.locator(".structure-workbench[data-workspace-expanded]")
            expect(expanded).to_be_visible()
            view_box = expanded.locator(".structure-workbench-view").bounding_box()
            data_box = expanded.locator(".structure-workbench-details").bounding_box()
            sequence_box = sequence.bounding_box()
            assert view_box and data_box and sequence_box
            if width > 1000:
                assert view_box["x"] < data_box["x"] and view_box["width"] > data_box["width"]
                assert abs(view_box["y"] - data_box["y"]) < 2
                assert abs(sequence_box["x"] - data_box["x"]) < 2
                assert sequence_box["height"] <= 137
            page.screenshot(path=evidence / "expanded-workspace.png")
            page.keyboard.press("Escape")
            expect(selection.get_by_text(label, exact=True)).to_be_visible()
            assert panel.locator("iframe").evaluate("(node, prior) => node === prior", frame)
            workspace.get_by_role(
                "combobox", name="显示残基" if zh else "Show residues", exact=True
            ).select_option("all")
            expect(table.locator("tbody tr")).to_have_count(16)
            with page.expect_download() as transfer:
                workspace.get_by_role(
                    "button", name="下载表格" if zh else "Download table", exact=True
                ).click()
            csv_path = evidence / "protein-contacts.csv"
            transfer.value.save_as(csv_path)
            exported = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding="utf-8-sig"))))
            exported_rows = [
                (r["chain"], r["residue_name"], int(r["residue_id"]), int(r["contacts"]))
                for r in exported
            ]
            native_rows = [(r["chain"], r["residue_name"], r["residue_id"], r["contacts"])
                           for r in protein]
            assert exported_rows == native_rows
            figure = export_figure(page, panel.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ), evidence, "native-epitope", language)
            inspect_png(figure, 600)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert page.request.get(source_url).body() == original
            assert page.request.get(base + "/api/jobs").json() == before
            page.screenshot(path=evidence / "workspace.png")
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(picker).to_be_visible()
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "job": identifier, "source_sha256": digest, "protein_residues": len(protein),
                "water_sites": len(rows) - len(protein),
                "native_contacts": native["total_contacts"],
                "same_iframe": True, "width": width, "font": verify_review_fonts(),
                "browser": browser.version, "errors": errors, "writes": writes,
                "scientific_tasks": 0,
            }, indent=2))
            browser.close()
