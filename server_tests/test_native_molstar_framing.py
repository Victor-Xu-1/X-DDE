"""Native Mol* figure composition against retained MD and FEP outputs."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_figure_framing_browser import figure_pixels


def capture(page, trigger, evidence, label, language, scale, standalone=True):
    zh = language == "zh"

    def configure(dialog):
        if standalone:
            dialog.get_by_role(
                "combobox", name="图件比例" if zh else "Panel layout", exact=True
            ).select_option("landscape")
        dialog.get_by_role(
            "combobox", name="清晰度" if zh else "Resolution", exact=True
        ).select_option("300")
        dialog.get_by_role(
            "checkbox", name="透明背景" if zh else "Transparent background", exact=True
        ).check()
        dialog.get_by_role(
            "combobox", name="结构大小" if zh else "Structure size", exact=True
        ).select_option(scale)

    png = export_figure(
        page, trigger, evidence, f"{label}-{scale}x", language, configure=configure
    )
    inspect_png(png, dpi=300, width=1051)
    return png


def ready(viewer):
    scene = viewer.get_by_role("application")
    expect(scene).to_have_attribute("data-loaded", "true", timeout=45000)
    expect(scene).to_have_attribute("aria-busy", "false", timeout=45000)
    assert scene.get_attribute("data-error") is None


@pytest.mark.parametrize(("case", "language"), [("openmm.dynamics", "en"), ("openfe.rbfe", "zh")])
def test_molstar_framing_uses_native_outputs(case, language):
    source = Path("outputs/native-simulations") / case
    identifier = (source / "job-id.txt").read_text().strip()
    evidence = source / "browser" / "framing"
    evidence.mkdir(parents=True, exist_ok=True)
    md = case.startswith("openmm")
    with platform(source / "state", evidence / "server.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        page.goto(f"{base}/#task={identifier}")
        jobs = page.request.get(f"{base}/api/jobs").json()
        root = page.get_by_test_id("dynamics-results" if md else "free-energy-results")
        viewer = root.get_by_test_id("molstar-viewport")
        original = None
        if md:
            ready(viewer)
            root.get_by_role("slider", name="Trajectory time", exact=True).fill("2")
            expect(viewer).to_have_attribute("data-frame", "2", timeout=45000)
            ready(viewer)
            coordinates = root.get_by_role("link", name="Download frame", exact=True)
            href = coordinates.get_attribute("href")
            assert href == f"/api/jobs/{identifier}/download?name=repeat-1-frame-0003.pdb"
            original = page.request.get(base + href).body()
            assert b"ATOM" in original
        else:
            root.get_by_role("tab", name="结合姿势", exact=True).click()
            expect(viewer).to_have_count(2)
            ready(viewer.nth(0))
            ready(viewer.nth(1))
            pair = root.get_by_role("button", name="导出比较图 ↓", exact=True)
            normal = capture(page, pair, evidence, "pair", language, "1", standalone=False)
            smaller = capture(page, pair, evidence, "pair", language, "0.75", standalone=False)
            assert normal.read_bytes() != smaller.read_bytes()
            expect(viewer.nth(0)).to_have_attribute("data-ligand", "a")
            expect(viewer.nth(1)).to_have_attribute("data-ligand", "b")
            root.get_by_role("button", name="叠加查看", exact=True).click()
            ready(viewer)
            selection = viewer.get_by_role("combobox", name="结合姿势显示", exact=True)
            selection.select_option("b")
            expect(viewer).to_have_attribute("data-ligand", "b")
            ready(viewer)
        export = viewer.get_by_role(
            "button", name="Download view ↓" if md else "下载视图 ↓", exact=True
        )
        one = capture(page, export, evidence, "structure", language, "1")
        half = capture(page, export, evidence, "structure", language, "0.5")
        reset = capture(page, export, evidence, "reset", language, "1")
        assert reset.read_bytes() == one.read_bytes()
        before, after = figure_pixels(page, one), figure_pixels(page, half)
        for pixels in (before, after):
            assert (pixels["width"], pixels["height"]) == (1051, 701)
            assert pixels["right"] > pixels["left"] and pixels["bottom"] > pixels["top"]
        (evidence / "coverage.json").write_text(
            json.dumps({"before": before, "after": after}, indent=2), encoding="utf-8"
        )
        width = before["right"] - before["left"]
        height = before["bottom"] - before["top"]
        assert after["right"] - after["left"] < 0.9 * width, (before, after)
        assert after["bottom"] - after["top"] < 0.9 * height, (before, after)
        if md:
            expect(viewer).to_have_attribute("data-frame", "2")
            expect(coordinates).to_have_attribute("href", href)
            assert page.request.get(base + href).body() == original
        else:
            expect(selection).to_have_value("b")
            expect(viewer).to_have_attribute("data-ligand", "b")
        assert page.request.get(f"{base}/api/jobs").json() == jobs
        browser.close()
