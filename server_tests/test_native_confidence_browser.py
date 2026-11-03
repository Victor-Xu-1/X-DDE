"""Retained native scores, actual Plotly geometry and downloads; no inference."""

import hashlib
import json
import os
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
