"""Retained native scores, actual Plotly geometry and downloads; no inference."""

import hashlib
import json
import os
import re
import statistics
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.confidence import confidence_view
from server_tests.browser_platform import platform
from server_tests.native_confidence_case import native_case


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_retained_atom_confidence_uses_native_fraction_scale(tmp_path, language, width):
    evidence = Path("outputs/native-confidence") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, selected = native_case(state, os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    output = state / "jobs" / identifier / "output"
    data = confidence_view(output, selected["artifact"], "pae")
    native = output / data["native_artifact"]
    original = native.read_bytes()
    raw = json.loads(original)
    assert data["atom_plddt_unit"] == "0-1"
    assert len(raw["atom_plddt"]) == 943 and data["token_count"] == 116
    assert abs(statistics.mean(raw["atom_plddt"]) * 100 - selected["plddt"]) <= 0.5
    assert data["binding"]["confidence_sha256"] == hashlib.sha256(original).hexdigest()
    assert (
        data["binding"]["structure_sha256"]
        == hashlib.sha256((output / selected["artifact"]).read_bytes()).hexdigest()
    )
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
        page.goto(base + "/#task=" + identifier)
        panel = page.locator(".confidence-panel")
        coloring = page.get_by_role("combobox", name="结构着色" if zh else "Structure coloring")
        expect(coloring).to_have_value("confidence", timeout=30000)
        sequence = page.get_by_role(
            "region", name="结构中的残基" if zh else "Residues in structure"
        )
        first = sequence.get_by_role("checkbox", name=re.compile(r"^A:TRP1 · pLDDT "))
        expect(first).to_be_visible()
        expected_first = statistics.mean(
            value * 100
            for i, value in enumerate(raw["atom_plddt"])
            if raw["atom_to_token_idx"][i] == 0
        )
        assert f"{expected_first:.1f}" in first.get_attribute("aria-label")
        first.click()
        expect(first).to_have_attribute("aria-checked", "true")
        matrix = panel.locator(".research-plot").first
        expect(matrix.locator(".shapelayer path")).to_have_count(2)
        coloring.select_option("chain")
        expect(first).to_have_attribute("aria-checked", "true")
        coloring.select_option("confidence")
        sequence.screenshot(path=str(evidence / "linked-sequence.png"))
        page.locator(".viewer-panel").screenshot(path=str(evidence / "confidence-structure.png"))
        page.get_by_role("button", name="清除选择" if zh else "Clear sequence selection").click()
        expect(first).to_have_attribute("aria-checked", "false")
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        matrix.scroll_into_view_if_needed()
        hit = matrix.locator(".nsewdrag").bounding_box()
        assert hit
        page.mouse.click(hit["x"] + hit["width"] / 232, hit["y"] + hit["height"] * 231 / 232)
        expect(first).to_have_attribute("aria-checked", "true")
        matrix.get_by_role(
            "combobox", name="图表操作" if zh else "Chart interaction"
        ).select_option("select")
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        hit = matrix.locator(".nsewdrag").bounding_box()
        assert hit
        page.mouse.move(hit["x"] + hit["width"] * 0.08, hit["y"] + hit["height"] * 0.7)
        page.mouse.down()
        page.mouse.move(hit["x"] + hit["width"] * 0.15, hit["y"] + hit["height"] * 0.8, steps=10)
        page.mouse.up()
        expect(sequence.get_by_role("checkbox", checked=True)).not_to_have_count(1)
        assert sequence.get_by_role("checkbox", checked=True).count() >= 10
        matrix.screenshot(path=str(evidence / "linked-pae.png"))
        panel.locator("details > summary").click()
        plot = panel.locator(".research-plot").filter(
            has=page.get_by_role("heading", name="Atom pLDDT", exact=True)
        )
        expect(plot.get_by_role("application")).to_have_attribute(
            "aria-busy", "false", timeout=30000
        )
        area = plot.locator(".nsewdrag").bounding_box()
        line = plot.locator(".scatterlayer .js-line").bounding_box()
        assert area and line
        # Native scores are 64–98%, not 0.64–0.98% near the bottom of a 0–100 axis.
        assert line["y"] + line["height"] < area["y"] + area["height"] * 0.5
        with page.expect_download() as transfer:
            panel.get_by_role(
                "link", name="下载完整原生置信度" if zh else "Download full native confidence"
            ).click()
        downloaded = evidence / "native-full-data.json"
        transfer.value.save_as(downloaded)
        assert downloaded.read_bytes() == original == native.read_bytes()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        plot.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / "atom-confidence.png"), full_page=False)
        (evidence / "source.json").write_text(
            json.dumps(
                {
                    "job": identifier,
                    "candidate": selected["id"],
                    "sha256": hashlib.sha256(original).hexdigest(),
                    "atom_unit": "0-1",
                    "display_unit": "0-100",
                    "no_inference": True,
                }
            )
        )
        assert not errors and not submissions, (errors, submissions)
        browser.close()
