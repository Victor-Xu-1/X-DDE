"""Inspect both sides of the retained STAT6 dimer without a new calculation."""

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


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_both_native_interface_endpoints(interaction_workspace, language, width):
    evidence = Path("outputs/protein-interface-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(
                f"if (location.origin === {json.dumps(base)}) {{"
                f"localStorage.setItem('opendde-workbench.language','{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda req: writes.append(req.url)
                    if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
            info = page.request.get(base + "/api/examples/structure").json()
            pin = info["pin"]
            assert pin and pin["case_id"] == "stat6-defined-molecules"
            identifier = pin["job_id"]
            result = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            active = result["protein_interfaces"][0]
            assert len(active["interactions"]) == 54 and active["polymer_residues"] == 883
            files = {}
            for key in ("structure_artifact", "table_artifact", "text_artifact", "xml_artifact"):
                name = active[key]
                url = base + f"/api/jobs/{identifier}/download?name=" + quote(name, safe="")
                data = page.request.get(url).body()
                assert hashlib.sha256(data).hexdigest() == result["artifact_sha256"][name]
                files[key] = (url, data)
            source_url, source_data = files["structure_artifact"]
            assert hashlib.sha256(source_data).hexdigest() == active["source"]["sha256"]
            before = page.request.get(base + "/api/jobs").json()
            fail_source = re.compile(re.escape(source_url) + "$")
            page.route(fail_source, lambda route: route.fulfill(status=503, body="Unavailable"))
            page.goto(base)
            navigation = open_navigation(page, language)
            navigation.get_by_role(
                "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
            ).click()
            picker = page.get_by_role(
                "combobox", name="研究任务" if zh else "Research task", exact=True
            )
            picker.select_option("structure")
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            workspace = page.locator(".protein-interface-results")
            expect(workspace).to_be_visible(timeout=15000)
            panel = workspace.locator(".viewer-panel")
            expect(panel.locator(".viewer-error")).to_be_visible(timeout=30000)
            workspace.get_by_role("searchbox").fill("A:PTR641")
            row = workspace.get_by_role("row").filter(has_text="A:PTR641").filter(
                has_text="B:ARG562"
            )
            partner = row.get_by_role("button", name=re.compile("B:ARG562$"))
            target = row.get_by_role("button", name=re.compile("A:PTR641$"))
            expect(partner).to_be_disabled()
            page.unroute(fail_source)
            panel.locator(".viewer-error").get_by_role(
                "button", name="重新加载" if zh else "Reload"
            ).click()
            expect(partner).to_be_enabled(timeout=30000)
            expect(picker).to_be_hidden()
            original_frame = panel.locator("iframe").element_handle()
            selection = panel.get_by_role(
                "group", name="当前结构选择" if zh else "Current structure selection"
            )
            partner.click()
            expect(selection.get_by_text("B:ARG562", exact=True)).to_be_visible()
            expect(partner).to_have_attribute("aria-pressed", "true")
            expect(target).to_have_attribute("aria-pressed", "false")
            target.focus()
            target.press("Enter")
            expect(selection.get_by_text("A:PTR641", exact=True)).to_be_visible()
            row.get_by_role("checkbox").check()
            expect(selection.get_by_text("A:PTR641", exact=True)).to_be_visible()
            panel.get_by_role(
                "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
            ).click()
            if width > 1000:
                assert workspace.locator(".research-table-scroll").evaluate(
                    "node => node.scrollWidth <= node.clientWidth + 1"
                )
            page.keyboard.press("Escape")
            expect(selection.get_by_text("A:PTR641", exact=True)).to_be_visible()
            partner.focus()
            partner.press("Enter")
            expect(selection.get_by_text("B:ARG562", exact=True)).to_be_visible()
            assert partner.evaluate("node => getComputedStyle(node).whiteSpace") == "nowrap"
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
                exported = list(csv.DictReader(stream))
            expected_rows = [r for r in active["interactions"] if
                             r["chain"] == "A" and r["number"] == 641]
            assert len(exported) == len(expected_rows)
            distance = "端点距离（Å）" if zh else "Endpoint distance (Å)"
            assert [float(r[distance]) for r in exported] == [r["distance"] for r in expected_rows]
            for key, label in (
                ("table_artifact", "接触表 CSV" if zh else "Contacts CSV"),
                ("text_artifact", "原生报告 TXT" if zh else "Native report TXT"),
                ("xml_artifact", "原生报告 XML" if zh else "Native report XML"),
                ("structure_artifact", "原始结构" if zh else "Source structure"),
            ):
                with page.expect_download() as transfer:
                    workspace.get_by_role("link", name=label, exact=True).click()
                saved = evidence / active[key]
                transfer.value.save_as(saved)
                assert saved.read_bytes() == files[key][1]
            trigger = panel.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            )
            figure = export_figure(page, trigger, evidence, "native-interface", language)
            inspect_png(figure, 600)
            stage = panel.locator(".molecular-stage iframe").bounding_box()
            details = workspace.locator(".structure-workbench-details").bounding_box()
            assert stage and details
            if width > 1000:
                assert stage["x"] < details["x"] and stage["width"] > details["width"]
                assert workspace.locator(".research-table-scroll").evaluate(
                    "node => node.scrollWidth <= node.clientWidth + 1"
                )
                sequence = workspace.locator(".structure-workbench-sequence").bounding_box()
                assert sequence and abs(sequence["x"] - details["x"]) < 2
                assert sequence["height"] <= 113
            else:
                assert details["y"] >= stage["y"] + stage["height"]
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert page.request.get(source_url).body() == source_data
            assert page.request.get(base + "/api/jobs").json() == before
            page.screenshot(path=evidence / "workspace.png")
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(picker).to_be_visible()
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "job": identifier, "contacts": 54, "residues": 883,
                "source_sha256": hashlib.sha256(source_data).hexdigest(),
                "focused": ["B:ARG562", "A:PTR641"], "same_iframe": True,
                "width": width, "errors": errors, "writes": writes, "scientific_tasks": 0,
            }, indent=2))
            browser.close()
