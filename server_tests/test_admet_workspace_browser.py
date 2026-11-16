"""Inspect sealed STAT6 predictions beside their native structure, without inference."""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.fixture(name="admet_saved_workspace", scope="module")
def saved_workspace(interaction_workspace):
    subprocess.run(
        [sys.executable, "server_tests/prepare_visual_components.py", "--components", "ketcher"],
        check=True,
    )
    return interaction_workspace


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_saved_stat6_endpoints_structures_and_native_exports(
    admet_saved_workspace, language, width
):
    evidence = Path("outputs/admet-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    with platform(admet_saved_workspace.state_dir, evidence / "service.log") as base:
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
            info = page.request.get(base + "/api/examples/admet.predict").json()
            assert info["pin"]["case_id"] == "stat6-defined-molecules"
            identifier = info["pin"]["job_id"]
            native = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            assert native["models_executed"] and native["predicted_count"] == 1
            assert len(native["endpoints"]) == 41 and len(native["rows"]) == 1
            before = page.request.get(base + "/api/jobs").json()
            row = native["rows"][0]
            source_url = base + f"/api/jobs/{identifier}/download?name=" + row["preview"]
            source = page.request.get(source_url).body()
            assert hashlib.sha256(source).hexdigest() == native["previews_sha256"][row["preview"]]
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="性质与安全性" if zh else "Properties and safety", exact=True
            ).click()
            picker = page.get_by_role("combobox", name="研究任务" if zh else "Research task")
            picker.select_option("admet.predict")
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            result = page.locator(".admet-results")
            expect(result).to_be_visible()
            expect(picker).to_be_hidden()
            selected = result.locator(".admet-selected-molecule")
            expect(selected.locator(".molecule-image")).to_have_attribute(
                "data-drawing-state", "ready", timeout=45000
            )
            expect(result.get_by_role(
                "tab", name=re.compile("^(候选分子|Candidate molecules)")
            )).to_have_count(0)
            table = result.locator(".admet-endpoint-scroll table")
            expect(table.locator("tbody tr")).to_have_count(41)
            for endpoint in native["endpoints"]:
                entry = table.locator('[data-endpoint-id="' + endpoint["id"] + '"]')
                value = row["predictions"][endpoint["id"]]
                assert float(entry.locator("strong").get_attribute("title")) == value
                shown = float(entry.locator("strong").inner_text())
                assert abs(shown - value) <= max(0.00005, abs(value) * 0.0006)
                track = entry.locator(".admet-score-track")
                bounded = (
                    endpoint["task_type"] == "classification"
                    and endpoint.get("minimum") == 0 and endpoint.get("maximum") == 1
                )
                expect(track).to_have_count(1 if bounded else 0)
                if bounded:
                    assert float(track.get_attribute("data-score")) == value
            figure_label = "文献图导出 ↓" if zh else "Export figure ↓"
            trigger = selected.get_by_role("button", name=figure_label, exact=True)
            vector = export_figure(
                page, trigger, evidence, "native-molecule-2d", language, "SVG"
            )
            assert b"<svg" in vector.read_bytes() and vector.stat().st_size > 1000
            search = result.get_by_role(
                "searchbox", name="搜索预测终点" if zh else "Search predicted endpoints"
            )
            search.fill("hERG")
            expect(table.locator("tbody tr")).to_have_count(1)
            search.fill("unmatched-xyz")
            expect(result.get_by_text(
                "没有匹配的终点" if zh else "No matching endpoints", exact=False
            )).to_be_visible()
            result.get_by_role(
                "button", name="显示全部终点" if zh else "Show all endpoints"
            ).click()
            expect(table.locator("tbody tr")).to_have_count(41)
            failure = re.compile(re.escape(source_url) + "$")
            page.route(failure, lambda route: route.fulfill(status=503, body="Unavailable"))
            selected.get_by_role(
                "tab", name="三维结构" if zh else "3D structure", exact=True
            ).click()
            panel = selected.locator(".viewer-panel")
            expect(panel.locator(".viewer-error")).to_be_visible(timeout=30000)
            expect(table.locator("tbody tr")).to_have_count(41)
            page.unroute(failure)
            panel.locator(".viewer-error").get_by_role(
                "button", name="重新加载" if zh else "Reload"
            ).click()
            expect(panel.locator(".molecular-stage iframe")).to_be_visible(timeout=30000)
            figure = export_figure(
                page, panel.get_by_role("button", name=figure_label, exact=True),
                evidence, "native-molecule-3d", language,
            )
            inspect_png(figure, 600)
            stage = panel.locator(".molecular-stage iframe").bounding_box()
            details = result.locator(".structure-workbench-details").bounding_box()
            assert stage and details
            if width > 1000:
                assert stage["x"] < details["x"] and stage["width"] > details["width"]
            else:
                assert stage["y"] < details["y"]
            assert result.locator(".admet-endpoint-scroll").evaluate(
                "node => node.scrollHeight > node.clientHeight"
            )
            for label, name, expected in (
                ("下载原始分子" if zh else "Download original molecule", row["preview"], source),
                ("下载预测表" if zh else "Download prediction table", "predictions.csv", None),
            ):
                with page.expect_download() as transfer:
                    selected.get_by_role("link", name=label).click()
                path = evidence / name
                transfer.value.save_as(path)
                if expected is not None:
                    assert path.read_bytes() == expected
                else:
                    assert hashlib.sha256(path.read_bytes()).hexdigest() == native["csv_sha256"]
            assert page.request.get(base + f"/api/jobs/{identifier}/result").json() == native
            assert page.request.get(base + "/api/jobs").json() == before
            assert page.request.get(source_url).body() == source
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=evidence / "workspace.png", full_page=True)
            page.screenshot(path=evidence / "viewport.png")
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(picker).to_be_visible()
            assert not writes and not errors, {"writes": writes, "errors": errors}
            browser.close()
