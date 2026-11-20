"""Saved public evidence, compact real Chrome layout and unchanged native exports."""

import base64
import csv
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import launch_review_browser, verify_review_fonts
from server_tests.publication_browser_helpers import export_figure
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.fixture(name="target_graphical_workspace", scope="module")
def graphical_workspace(interaction_workspace):
    subprocess.run(
        [sys.executable, "server_tests/prepare_visual_components.py", "--components", "ketcher"],
        check=True,
    )
    return interaction_workspace


@pytest.mark.parametrize("entity", ["disease", "target"])
@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_saved_target_evidence(target_graphical_workspace, entity, language, width):
    evidence = Path("outputs/target-evidence") / f"{entity}-{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    with platform(target_graphical_workspace.state_dir, evidence / "service.log") as base:
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
            info = page.request.get(base + f"/api/examples/discovery.{entity}").json()
            pin = info["pin"]
            assert pin and pin["case_id"] == "stat6-defined-molecules"
            identifier = pin["job_id"]
            native_url = base + f"/api/jobs/{identifier}/result"
            original = page.request.get(native_url).body()
            result = json.loads(original)
            association = (
                result["entity"].get("associatedTargets")
                or result["entity"]["associatedDiseases"]
            )
            rows = association["rows"]
            assert rows and result["request"]["entity"] == entity
            if entity == "disease":
                assert result["entity"]["id"] == "MONDO_0004979"
                assert len(rows) == 50 and association["count"] == 7772
            else:
                assert result["entity"]["approvedSymbol"] == "STAT6"
            before = page.request.get(base + "/api/jobs").json()
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="靶点研究" if zh else "Target research", exact=True
            ).click()
            picker = page.get_by_role(
                "combobox", name="研究任务" if zh else "Research task", exact=True
            )
            picker.select_option(f"discovery.{entity}")
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            workspace = page.locator(".target-evidence-results")
            expect(workspace).to_be_visible(timeout=15000)
            expect(picker).to_be_hidden()
            table = workspace.get_by_role(
                "table", name="关联证据" if zh else "Association evidence", exact=True
            )
            expect(table).to_be_visible()
            expect(workspace.locator(".discovery-sources")).to_contain_text("Open Targets")
            expect(workspace.locator(".result-summary-grid dd").first).to_have_text(
                str(association["count"])
            )
            header = workspace.locator(".evidence-header")
            expect(header.locator(".questionnaire-overline")).to_be_visible()
            expect(header.locator("h3")).to_have_text(
                result["entity"].get("approvedSymbol") or result["entity"]["name"]
            )
            expect(header.locator(":scope > span")).to_be_visible()
            if result["entity"].get("approvedName"):
                expect(header.locator(".field-help")).to_have_text(result["entity"]["approvedName"])
                expect(header.locator(".field-help")).to_be_visible()
            workspace.evaluate("""node => {
              for (let parent = node.parentElement; parent; parent = parent.parentElement)
                parent.scrollTo({top: 0, left: 0, behavior: 'instant'});
              window.scrollTo({top: 0, left: 0, behavior: 'instant'});
            }""")
            geometry = workspace.evaluate("""node => {
              const rect = selector => {
                const box = node.querySelector(selector).getBoundingClientRect();
                return {x: box.x, y: box.y, width: box.width, height: box.height};
              };
              return {viewport: {width: innerWidth, height: innerHeight},
                identity: rect('.evidence-header'),
                summary: rect('.result-summary-grid'), table: rect('.research-table'),
                firstRow: rect('.research-table tbody tr'),
                overflow: document.documentElement.scrollWidth > innerWidth + 1};
            }""")
            assert not geometry["overflow"], geometry
            if width > 1000:
                assert geometry["identity"]["height"] <= 44, geometry
                assert geometry["table"]["y"] <= 500, geometry
                assert geometry["summary"]["height"] <= 45, geometry
                assert geometry["firstRow"]["y"] + geometry["firstRow"]["height"] < 1000, geometry
            page.screenshot(path=evidence / "evidence-workspace.png")
            with page.expect_download() as transfer:
                workspace.get_by_role(
                    "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
                ).click()
            exported = evidence / "native-associations.csv"
            transfer.value.save_as(exported)
            with exported.open(encoding="utf-8-sig", newline="") as stream:
                exported_rows = list(csv.DictReader(stream))
            assert len(exported_rows) == len(rows)
            identity = "研究对象" if zh else "Entity"
            metric = "关联分数" if zh else "Association score"
            record_id = "下一步" if zh else "Next step"
            expected = sorted(
                (row["target"]["id"], row["target"]["approvedSymbol"], row["score"])
                if "target" in row else (row["disease"]["id"], row["disease"]["name"], row["score"])
                for row in rows
            )
            assert sorted(
                (row[record_id], row[identity], float(row[metric])) for row in exported_rows
            ) == expected
            score_sort = table.get_by_role(
                "button", name="关联分数" if zh else "Association score", exact=True
            )
            score_sort.click()
            column = table.get_by_role(
                "columnheader", name="关联分数" if zh else "Association score"
            )
            expect(column).to_have_attribute("aria-sort", "ascending")
            score_sort.click()
            first = table.locator("tbody tr").first
            source_link = first.get_by_role(
                "link", name="查看来源" if zh else "View source", exact=True
            )
            highest = max(rows, key=lambda row: row["score"])
            source_id = highest["target"]["id"] if entity == "disease" else highest["disease"]["id"]
            expect(source_link).to_have_attribute(
                "href", "https://platform.opentargets.org/"
                + ("target/" if entity == "disease" else "disease/") + source_id
            )
            label = (
                highest["target"]["approvedSymbol"] if entity == "disease"
                else highest["disease"]["name"]
            )
            search = workspace.get_by_role("searchbox")
            search.fill(label)
            expect(table.get_by_text(label, exact=True)).to_be_visible()
            search.fill("no-such-evidence-record-73902")
            expect(table.locator("tbody tr")).to_have_count(0)
            expect(workspace.get_by_role(
                "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
            )).to_be_disabled()
            search.fill("")
            expect(table.locator("tbody tr")).to_have_count(min(20, len(rows)))
            activity_preview = (
                inspect_activity(page, workspace, result, evidence, language, width)
                if entity == "target" else None
            )
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(picker).to_be_visible()
            assert page.request.get(native_url).body() == original
            assert page.request.get(base + "/api/jobs").json() == before
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "job": identifier, "entity": entity, "language": language,
                "source_total": association["count"], "retrieved": len(rows),
                "result_sha256": hashlib.sha256(original).hexdigest(),
                "exported_rows": len(exported_rows), "geometry": geometry,
                "activity_preview": activity_preview,
                "browser": browser.version, "font": verify_review_fonts(),
                "errors": errors, "writes": writes, "scientific_tasks": 0,
            }, indent=2))
            browser.close()


def inspect_activity(page, workspace, result, evidence, language, width):
    zh = language == "zh"
    workspace.get_by_role(
        "tab", name="已有实测活性 20" if zh else "Reported activities 20", exact=True
    ).click()
    panel = workspace.locator(".target-activity-workspace")
    preview = panel.get_by_role(
        "region", name="选中记录的分子结构" if zh else "Selected reported molecule"
    )
    drawing = preview.locator(".molecule-image")
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
    activities = result["activities"]["rows"]
    first = activities[0]
    expect(preview.get_by_role("heading")).to_have_text(first["molecule_chembl_id"])
    index = next(i for i, row in enumerate(activities)
                 if row.get("canonical_smiles")
                 and row["canonical_smiles"] != first.get("canonical_smiles"))
    expected = activities[index]
    table = panel.get_by_role(
        "table", name="已有实测活性" if zh else "Reported activities", exact=True
    )
    row = table.locator("tbody tr").nth(index)
    row.focus()
    row.press("Enter")
    expect(row).to_have_attribute("aria-selected", "true")
    expect(preview.get_by_role("heading")).to_have_text(expected["molecule_chembl_id"])
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
    expect(preview).to_contain_text(expected["assay_chembl_id"])
    encoded = drawing.get_by_role("img").get_attribute("src")
    vector = base64.b64decode(encoded.split(",", 1)[1])
    svg = ET.fromstring(vector)
    assert svg.findall(".//{http://www.w3.org/2000/svg}path")
    assert "CH3" not in "".join(svg.itertext())
    (evidence / "selected-activity-structure.svg").write_bytes(vector)
    figure = export_figure(
        page, drawing.get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
        ), evidence, "reported-activity", language, "SVG",
    )
    assert b"<svg" in figure.read_bytes() and figure.stat().st_size > 1000
    with page.expect_download() as transfer:
        panel.get_by_role(
            "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
        ).click()
    exported = evidence / "native-activities.csv"
    transfer.value.save_as(exported)
    with exported.open(encoding="utf-8-sig", newline="") as stream:
        records = list(csv.DictReader(stream))
    labels = (
        ("化合物", "实测端点", "结果与单位", "实验") if zh
        else ("Compound", "Measured endpoint", "Result and unit", "Assay")
    )
    expected_records = []
    for item in activities:
        measurement = (
            f"{item.get('standard_relation') or ''} "
            f"{item['standard_value'] if item['standard_value'] is not None else '—'} "
            f"{item.get('standard_units') or ''}"
        )
        # Retain the existing spreadsheet formula protection on leading '='.
        if item.get("standard_relation") == "=":
            measurement = "'" + measurement
        expected_records.append((item["molecule_chembl_id"], item["standard_type"],
                                 measurement, item["assay_chembl_id"]))
    assert [tuple(record[label] for label in labels) for record in records] == expected_records
    activity_id = "活性记录编号" if zh else "Activity ID"
    assert [record[activity_id] for record in records] == [
        str(item["activity_id"]) for item in activities
    ]
    preview.scroll_into_view_if_needed()
    preview.evaluate("""node => {
      const header = document.querySelector('.studio-topbar').getBoundingClientRect();
      window.scrollBy({top: node.getBoundingClientRect().top - header.bottom - 24,
        behavior: 'instant'});
    }""")
    stage = panel.locator(".structure-workbench-view").bounding_box()
    details = panel.locator(".structure-workbench-details").bounding_box()
    assert stage and details and stage["height"] >= 300
    if width > 1000:
        assert stage["x"] + stage["width"] <= details["x"]
        assert stage["width"] > details["width"]
    else:
        assert stage["y"] + stage["height"] <= details["y"]
    assert stage["y"] >= 0 and stage["y"] + stage["height"] <= 1000
    header = page.locator(".studio-topbar").bounding_box()
    assert header and stage["y"] >= header["y"] + header["height"]
    assert panel.locator(".research-table-scroll").evaluate(
        "node => node.scrollWidth <= node.clientWidth + 1"
    )
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    page.screenshot(path=evidence / "activity-workspace.png")
    if width < 1000:
        table.scroll_into_view_if_needed()
        page.screenshot(path=evidence / "activity-records.png")
    return {"activity_id": expected["activity_id"], "molecule": expected["molecule_chembl_id"],
            "stage": stage, "details": details, "native_vector": figure.name,
            "exported_activity_rows": len(records), "new_3d_conformers": 0}
