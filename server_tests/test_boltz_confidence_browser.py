"""Real native-format UI/Plotly/WebGL linkage; controlled fixture, never inference."""

import hashlib
import json
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.boltz_confidence_case import native_case
from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width,declared", [("en", 1440, False), ("zh", 390, True)])
def test_boltz_matrix_sequence_3d_download_and_retry(tmp_path, language, width, declared):
    evidence = Path("outputs/boltz-confidence") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store, job, _, sources, _ = native_case(state, declared=declared)
    zh = language == "zh"
    errors, submissions = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base + f"/#view=results&module=structures&task={job.id}")
        panel = page.locator(".confidence-panel")
        color = page.get_by_role("combobox", name="结构着色" if zh else "Structure coloring")
        expect(color).to_have_value("confidence", timeout=30000)
        modes = panel.get_by_role("combobox", name="置信度视图" if zh else "Confidence view")
        expect(modes.locator("option")).to_have_count(2)
        expect(panel.get_by_role("heading", name="Token pLDDT", exact=True)).to_be_visible()
        sequence = page.get_by_role(
            "region", name="结构中的残基" if zh else "Residues in structure"
        )
        first = sequence.get_by_role("checkbox", name=re.compile(r"^ZA:ALA43 · pLDDT 92"))
        expect(first).to_be_visible()
        first.click()
        expect(first).to_have_attribute("aria-checked", "true")
        matrix = panel.locator(".research-plot").first
        curve = panel.locator(".research-plot").filter(
            has=page.get_by_role("heading", name="Token pLDDT", exact=True)
        )
        page.get_by_role("button", name="清除选择" if zh else "Clear sequence selection").click()
        curve.scroll_into_view_if_needed()
        expect(curve.get_by_role("application")).to_have_attribute("aria-busy", "false")
        point = curve.locator(".scatterlayer .point").first
        point.scroll_into_view_if_needed()
        marker = point.bounding_box()
        assert marker and marker["width"] > 0 and marker["height"] > 0
        coordinates = {
            "x": marker["x"] + marker["width"] / 2,
            "y": marker["y"] + marker["height"] / 2,
        }
        target = curve.evaluate(
            "(plot, point) => { const hit = document.elementFromPoint(point.x, point.y); return { inside: Boolean(hit && plot.contains(hit)), tag: hit?.tagName, text: hit?.textContent?.slice(0,120), point }; }",
            coordinates,
        )
        (evidence / "curve-hit-target.json").write_text(json.dumps(target))
        assert target["inside"], target
        page.mouse.click(coordinates["x"], coordinates["y"])
        page.screenshot(path=evidence / "curve-point-selection.png", full_page=True)
        expect(first).to_have_attribute("aria-checked", "true")
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="清除选择" if zh else "Clear sequence selection").click()
        matrix.scroll_into_view_if_needed()
        hit = matrix.locator(".nsewdrag").bounding_box()
        assert hit
        page.mouse.click(hit["x"] + hit["width"] / 12, hit["y"] + hit["height"] * 11 / 12)
        expect(first).to_have_attribute("aria-checked", "true")
        color.select_option("chain")
        modes.select_option("pde")
        expect(panel.get_by_role("heading", name=re.compile("PDE"))).to_be_visible()
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        expect(color).to_have_value("chain")
        color.select_option("confidence")
        with page.expect_download() as transfer:
            panel.get_by_role(
                "link", name="下载完整原生置信度" if zh else "Download full native confidence"
            ).click()
        downloaded = evidence / "native-pde.npz"
        transfer.value.save_as(downloaded)
        assert downloaded.read_bytes() == sources["pde"]
        native = (
            state
            / "jobs"
            / job.id
            / "output"
            / (
                "structure-001-pde.npz"
                if declared
                else (
                    "native/boltz_results_prediction/predictions/prediction/"
                    "pde_prediction_model_0.npz"
                )
            )
        )
        native.write_bytes(b"invalid format contract fixture")
        # A declared result binds all sidecars as one bundle; a historical task
        # independently verifies only its requested matrix. Neither may display
        # a corrupt PDE, and recovery must reread the same selected source.
        if not declared:
            modes.select_option("pae")
            expect(panel.get_by_role("heading", name=re.compile("PAE"))).to_be_visible()
            expect(
                panel.get_by_role(
                    "link", name="下载完整原生置信度" if zh else "Download full native confidence"
                )
            ).to_be_visible()
        else:
            page.reload()
        modes.select_option("pde")
        expect(panel.get_by_role("status")).to_contain_text(
            "无法核验" if zh else "could not be verified"
        )
        native.write_bytes(sources["pde"])
        panel.get_by_role("button", name="重新读取置信度" if zh else "Reload confidence").click()
        expect(
            panel.get_by_role(
                "link", name="下载完整原生置信度" if zh else "Download full native confidence"
            )
        ).to_be_visible()
        expect(color).to_have_value("confidence")
        workspace = page.locator(".structure-workbench")
        preview = workspace.locator(".structure-workbench-view").bounding_box()
        details = workspace.locator(".structure-workbench-details").bounding_box()
        assert preview and details
        if width >= 1000:
            assert preview["x"] < details["x"] and preview["width"] > details["width"]
        else:
            assert details["y"] >= preview["y"] + preview["height"] - 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        panel.screenshot(path=evidence / "native-confidence.png")
        workspace.screenshot(path=evidence / "linked-workspace.png")
        page.screenshot(path=evidence / "full-page.png", full_page=True)
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "fixture": "NumPy native-format contract; not a calculated research example",
                    "recorded_at_completion": declared,
                    "download_sha256": hashlib.sha256(downloaded.read_bytes()).hexdigest(),
                    "no_inference": True,
                    "submissions": submissions,
                    "console_errors": errors,
                }
            )
        )
        assert not errors and not submissions
        assert len(store.list_jobs()) == 1
        browser.close()
