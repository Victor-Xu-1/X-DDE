"""Measure real residue, distance, channel and attachment labels in downloaded native PNGs."""

import struct
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.native_annotation_views import (
    measure_residues,
    residue_labels,
    source_bytes,
    study_structure,
)
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.publication_raster_metrics import (
    inspect_native_label_pixels,
    observe_native_label_pixels,
)


def native_view(panel):
    return panel.locator("iframe").first.evaluate(
        "frame => frame.contentWindow.document.querySelector('canvas')._3dmol_viewer.getView()"
    )


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("kind", ["residue", "measurement", "channel", "attachment"])
def test_native_annotation_typography_and_source_integrity(kind, language):
    zh = language == "zh"
    evidence = Path("outputs/publication-browser/annotations") / kind
    evidence.mkdir(parents=True, exist_ok=True)
    state = Settings.from_env().state_dir
    capability = {"channel": "caver.paths", "attachment": "deepternary.model"}.get(kind)
    if capability:
        state = state.parent / "publication-cases" / capability
    with platform(state, evidence / (language + ".log")) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1440, "height": 1000}, device_scale_factor=1 if zh else 2
        )
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        observe_native_label_pixels(page)
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        if capability:
            info = page.request.get(
                base + "/api/examples/" + capability + "?profile=archive"
            ).json()
            assert info["pin"], "The verified historical native result must be present"
            page.goto(base + "/#task=" + info["pin"]["job_id"])
            if kind == "attachment":
                page.get_by_role(
                    "tab", name="连接位点" if zh else "Attachment sites", exact=True
                ).click()
                panel = page.locator(".attachment-directions .viewer-panel").first
                required = "→"
            else:
                panel = page.locator(".channel-preview .viewer-panel").first
                required = (
                    page.locator(".channel-legend span")
                    .filter(has=page.locator(".channel-narrow"))
                    .inner_text()
                    .rsplit("·", 1)[1]
                    .strip()
                )
        else:
            panel = study_structure(page, language)
            required = None
        capture = panel.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=45000)
        original = source_bytes(page, base, panel)
        if kind == "residue":
            required = residue_labels(panel, language)
        elif kind == "measurement":
            required = measure_residues(panel, language)
        elif kind == "attachment":
            # Keep the measured attachment text visible independently of geometric contacts.
            panel.get_by_role(
                "checkbox", name="显示相互作用" if zh else "Show interactions", exact=True
            ).uncheck()
        compact = kind in {"measurement", "attachment"}
        original_view = native_view(panel)

        def configure(dialog):
            if compact:
                dialog.get_by_role(
                    "combobox", name="清晰度" if zh else "Resolution", exact=True
                ).select_option("300")
                dialog.get_by_role(
                    "combobox", name="印刷字号" if zh else "Printed type size", exact=True
                ).select_option("9")

        image = export_figure(
            page,
            panel.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ),
            evidence,
            language + "-native",
            language,
            configure=configure,
        )
        dpi, width, pt = (300, 1051, 9) if compact else (600, 2102, 7)
        inspect_png(image, dpi=dpi, width=width)
        assert native_view(panel) == pytest.approx(original_view, abs=1e-7)
        assert struct.unpack(">II", image.read_bytes()[16:24]) == (width, width)
        inspect_native_label_pixels(
            panel, evidence, language, dpi=dpi, width=width, pt=pt, required_text=required
        )
        if kind == "residue":
            for shape, expected_height in [("landscape", 701), ("portrait", 1401)]:

                def layout_choice(dialog, selected_shape=shape):
                    dialog.get_by_role(
                        "combobox", name="图件比例" if zh else "Panel layout", exact=True
                    ).select_option(selected_shape)
                    dialog.get_by_role(
                        "combobox", name="清晰度" if zh else "Resolution", exact=True
                    ).select_option("300")
                    dialog.get_by_role(
                        "combobox", name="印刷字号" if zh else "Printed type size", exact=True
                    ).select_option("9")

                image = export_figure(
                    page,
                    panel.get_by_role(
                        "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
                    ),
                    evidence,
                    language + "-" + shape,
                    language,
                    configure=layout_choice,
                )
                inspect_png(image, dpi=300, width=1051)
                assert native_view(panel) == pytest.approx(original_view, abs=1e-7)
                assert struct.unpack(">II", image.read_bytes()[16:24]) == (1051, expected_height)
                inspect_native_label_pixels(
                    panel,
                    evidence,
                    language + "-" + shape,
                    dpi=300,
                    width=1051,
                    pt=9,
                    required_text=required,
                )
        assert source_bytes(page, base, panel) == original
        assert jobs == page.request.get(base + "/api/jobs").json()
        assert not errors and not submissions
        expect(capture).to_be_enabled()
        page.screenshot(path=str(evidence / (language + "-restored.png")))
        browser.close()
