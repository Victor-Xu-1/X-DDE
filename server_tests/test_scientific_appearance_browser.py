"""Native scientific paper contrast, retained view and real figures; no inference."""

import base64
import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.store import Store
from server_tests.appearance_preview import load_reference, rendered_background
from server_tests.browser_platform import platform
from server_tests.native_confidence_case import native_case
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg
from server_tests.test_appearance_browser import PALETTES, canonical_hex
from server_tests.test_navigation_shell_browser import settings


def axis_contrast(plot):
    colors = plot.locator(".xtick text, .ytick text, .cbaxis text").evaluate_all(
        "nodes => nodes.map(node => getComputedStyle(node).fill)"
    )
    assert colors
    for color in colors:
        channels = [int(value) / 255 for value in re.findall(r"\d+", color)[:3]]
        assert len(channels) == 3, color
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
        luminance = sum(v * w for v, w in zip(linear, [.2126, .7152, .0722], strict=True))
        assert 1.05 / (luminance + .05) >= 4.5, color
    return colors


def settled_frame(frame, iframe, path):
    frame.evaluate(
        "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    )
    iframe.screenshot(path=path)
    # Composited screenshots can include the parent's sticky header/zoom buttons.
    # The native canvas preserves its drawing buffer for the SDK's own PNG export.
    encoded = frame.locator("#molecule canvas").first.evaluate(
        "canvas => canvas.toDataURL('image/png')"
    )
    assert encoded.startswith("data:image/png;base64,")
    native = base64.b64decode(encoded.split(",", 1)[1], validate=True)
    assert len(native) > 10000, "An empty native canvas cannot establish view preservation"
    path.with_stem(path.stem + "-native").write_bytes(native)
    return hashlib.sha256(native).hexdigest()


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_scientific_surface_and_export_survive_theme_changes(tmp_path, language, width):
    evidence = Path("outputs/appearance") / f"scientific-{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, candidate = native_case(state, os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    source_root = state / "jobs" / identifier / "output"
    originals = {path: path.read_bytes() for path in source_root.rglob("*") if path.is_file()}
    complex_bytes = verified_input("stat6_structure")
    asset = AssetStore(Store(state / "jobs.sqlite3"), state / "assets").save(
        "STAT6-9BIG-experimental-complex.cif", "structure", complex_bytes
    )
    reference_sha = hashlib.sha256(complex_bytes).hexdigest()
    zh = language == "zh"
    errors, writes, measurements = [], [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.add_init_script(
            f"if (location.origin === {json.dumps(base)}) {{"
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            "localStorage.setItem('x-dde-theme','light');}"
        )
        context.on(
            "page", lambda page: page.on("pageerror", lambda error: errors.append(str(error)))
        )
        context.on(
            "request", lambda request: writes.append(request.url)
            if request.method in {"POST", "PUT", "PATCH", "DELETE"} else None,
        )
        control = context.new_page()
        control.goto(base)
        settings(control, language)
        group = control.get_by_role("group", name="外观主题" if zh else "Appearance", exact=True)
        page = context.new_page()
        page.goto(base + "/#task=" + identifier)
        plot = page.locator(".confidence-panel .research-plot").first
        expect(plot.get_by_role("application")).to_have_attribute(
            "aria-busy", "false", timeout=30000
        )
        first = page.get_by_role("checkbox", name=re.compile(r"^A:TRP1 · pLDDT "))
        first.click()
        expect(first).to_have_attribute("aria-checked", "true")
        iframe = page.locator(".molecular-stage iframe")
        original_frame = iframe.element_handle()
        frame = original_frame.content_frame()
        assert frame
        preview = context.new_page()
        preview.goto(base + "/viewer.html")
        reference = load_reference(preview, base, asset, reference_sha)
        assert reference["ligands"], "The experimental control must include its real ligand"
        baseline = None
        for theme in ("light", "dark", "warm"):
            en, cn, canvas, _chart = PALETTES[theme]
            group.get_by_role("radio", name=cn if zh else en, exact=True).check()
            for target in (control, page, preview, frame):
                expect(target.locator("html")).to_have_attribute("data-theme", theme)
            assert canonical_hex(page.evaluate(
                "getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()"
            )) == canvas
            expect(plot.get_by_role("application")).to_have_attribute("aria-busy", "false")
            assert plot.get_by_role("application").evaluate(
                "node => getComputedStyle(node).backgroundColor"
            ) == "rgb(255, 255, 255)"
            assert iframe.evaluate("(node, prior) => node === prior", original_frame)
            expect(first).to_have_attribute("aria-checked", "true")
            pixels = settled_frame(frame, iframe, evidence / f"protein-{theme}.png")
            baseline = baseline or pixels
            assert pixels == baseline, "Theme changes must preserve the rendered camera and colors"
            assert rendered_background(preview, evidence / f"complex-{theme}.png")[:3] == [255] * 3
            measurements.append({
                "theme": theme, "axis_colors": axis_contrast(plot), "view": pixels,
            })
            if theme == "dark":
                figure_label = "文献图导出 ↓" if zh else "Export figure ↓"
                png = export_figure(
                    page, page.locator(".viewer-panel").get_by_role("button", name=figure_label),
                    evidence, "night-protein", language,
                )
                inspect_png(png)
                svg = export_figure(
                    page, plot.get_by_role("button", name=figure_label), evidence,
                    "night-pae", language, format="SVG",
                )
                inspect_svg(svg, "原始 token 索引" if zh else "Native token index")
                expect(first).to_have_attribute("aria-checked", "true")
                restored = settled_frame(frame, iframe, evidence / "restored-after-export.png")
                assert restored == baseline
            page.screenshot(path=evidence / f"workspace-{theme}.png")
        for source, original in originals.items():
            assert source.read_bytes() == original
        downloaded_reference = page.request.get(base + "/api/assets/" + asset.id).body()
        assert hashlib.sha256(downloaded_reference).hexdigest() == reference_sha
        assert len(page.request.get(base + "/api/jobs").json()) == 1
        assert not errors and not writes, (errors, writes)
        (evidence / "receipt.json").write_text(json.dumps({
            "job": identifier, "candidate": candidate["id"], "themes": measurements,
            "native_files_unchanged": len(originals), "scientific_calculations": 0,
            "complex_ligands": reference["ligands"], "errors": errors, "writes": writes,
        }, indent=2))
        browser.close()
