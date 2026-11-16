"""Saved public evidence, compact real Chrome layout and unchanged native exports."""

import csv
import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import launch_review_browser, verify_review_fonts
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("entity", ["disease", "target"])
@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_saved_target_evidence(interaction_workspace, entity, language, width):
    evidence = Path("outputs/target-evidence") / f"{entity}-{language}-{width}"
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
            info = page.request.get(base + f"/api/examples/discovery.{entity}").json()
            pin = info["pin"]
            assert pin and pin["case_id"] == "stat6-defined-molecules"
            identifier = pin["job_id"]
            native_url = base + f"/api/jobs/{identifier}/result"
            original = page.request.get(native_url).body()
            result = json.loads(original)
            association = result["entity"].get("associatedTargets") or result["entity"]["associatedDiseases"]
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
            expect(workspace.locator(".result-summary-grid dd").first).to_have_text(str(association["count"]))
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
                summary: rect('.result-summary-grid'), table: rect('.research-table'),
                firstRow: rect('.research-table tbody tr'),
                overflow: document.documentElement.scrollWidth > innerWidth + 1};
            }""")
            assert not geometry["overflow"], geometry
            if width > 1000:
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
            assert sorted((row[record_id], row[identity], float(row[metric])) for row in exported_rows) == expected
            score_sort = table.get_by_role(
                "button", name="关联分数" if zh else "Association score", exact=True
            )
            score_sort.click()
            expect(table.get_by_role("columnheader", name="关联分数" if zh else "Association score")).to_have_attribute(
                "aria-sort", "ascending"
            )
            score_sort.click()
            first = table.locator("tbody tr").first
            source_link = first.get_by_role("link", name="查看来源" if zh else "View source", exact=True)
            highest = max(rows, key=lambda row: row["score"])
            source_id = highest["target"]["id"] if entity == "disease" else highest["disease"]["id"]
            expect(source_link).to_have_attribute(
                "href", "https://platform.opentargets.org/" + ("target/" if entity == "disease" else "disease/") + source_id
            )
            label = highest["target"]["approvedSymbol"] if entity == "disease" else highest["disease"]["name"]
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
                "browser": browser.version, "font": verify_review_fonts(),
                "errors": errors, "writes": writes, "scientific_tasks": 0,
            }, indent=2))
            browser.close()
