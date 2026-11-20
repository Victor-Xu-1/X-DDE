"""Inspect the retained STAT6 alignment and its actual native views without compute."""

import base64
import hashlib
import json
import os
import struct
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/ensemble")


@pytest.mark.parametrize(("width", "height", "language", "visible"), [
    (1180, 720, "en", 0.99),
    (1440, 900, "en", 0.70), (1110, 580, "en", 0.25),
    (390, 775, "zh", 0.25), (320, 568, "en", 0.03),
])
def test_retained_stat6_receptor_preview(width, height, language, visible):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"].rstrip("/")
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    with sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def read_only(route):
            if route.request.method in {"GET", "HEAD", "OPTIONS"}:
                route.continue_()
            else:
                writes.append(route.request.url)
                route.abort()

        def read(path):
            response = page.request.get(base + "/api/" + path)
            assert response.ok, path
            return response

        page.route("**/api/**", read_only)
        example = read("examples/biopython.ensemble").json()
        assert example["study"]["id"] == "stat6"
        job = example["pin"]["job_id"]
        native = read(f"jobs/{job}/result").json()
        reference = next(row for row in native["members"] if row["status"] == "reference")
        aligned = next(row for row in native["members"] if row["status"] == "aligned")
        selected_name = label("Receptor ", "受体 ") + str(aligned["index"] + 1)
        page.goto(f"{base}/#task={job}")
        result = page.locator(".receptor-results")
        scene = result.get_by_role("region", name=label("Selected receptor preview", "所选受体预览"))
        stage = scene.locator(".molecular-stage iframe")
        figure = scene.get_by_role(
            "button", name=label("Export figure ↓", "文献图导出 ↓"), exact=True
        )

        def expect_loaded_sources(count):
            expect(figure).to_be_enabled(timeout=30000)
            page.wait_for_function("""(count) => {
              const frame = document.querySelector('.receptor-overlay-detail .molecular-stage iframe');
              const native = frame?.contentDocument.querySelector('canvas')?._3dmol_viewer;
              return native?.getModel(0)?.getID() === 0 &&
                (native.getModel(1)?.getID() === 1) === (count === 2);
            }""", arg=count)

        expect_loaded_sources(2)
        page.screenshot(path=EVIDENCE / f"stat6-receptor-first-view-{width}.png")
        canvas = stage.bounding_box()
        assert canvas
        pixels = max(0, min(height, canvas["y"] + canvas["height"]) - max(0, canvas["y"]))
        (EVIDENCE / f"stat6-receptor-geometry-{width}.json").write_text(json.dumps({
            "job": job, "viewport": [width, height], "canvas": canvas,
            "visible_pixels": pixels, "language": language,
        }, indent=2))
        expect(stage).to_be_in_viewport(ratio=visible)
        view = result.locator(".structure-workbench-view").first.bounding_box()
        details = result.locator(".structure-workbench-details").first.bounding_box()
        assert view and details
        if width > 1000:
            assert view["width"] > details["width"]
            assert abs(view["y"] - details["y"]) < 3
            assert view["x"] + view["width"] <= details["x"]
        else:
            assert view["y"] + view["height"] <= details["y"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        if width <= 390:
            jump = scene.get_by_role("button", name=label("Details", "详情"), exact=True)
            expect(jump).to_be_visible()
            button = jump.bounding_box()
            assert button and button["height"] >= 44
            assert button["x"] + button["width"] <= view["x"] + view["width"] + 1
        original_frame = stage.element_handle()
        assert original_frame
        picker = scene.get_by_role("combobox", name=label("Preview receptor", "预览受体"))
        overlay = scene.get_by_role("button", name=label("Overlay reference", "叠合参照"))
        expect(picker).to_have_value(str(aligned["index"]))
        expect(overlay).to_have_attribute("aria-pressed", "true")
        overlay.click()
        expect(overlay).to_have_attribute("aria-pressed", "false")
        expect_loaded_sources(1)
        assert original_frame.evaluate("(frame) => frame.isConnected")
        picker.select_option(str(reference["index"]))
        expect(overlay).to_be_disabled()
        expect_loaded_sources(1)
        picker.select_option(str(aligned["index"]))
        expect(overlay).to_have_attribute("aria-pressed", "false")
        overlay.click()
        expect_loaded_sources(2)
        expect(overlay).to_have_attribute("aria-pressed", "true")
        row = result.get_by_role("row").filter(has=page.get_by_role(
            "button", name=selected_name, exact=True,
        ))
        expect(row).to_contain_text(f"{aligned['transformation']['rmsd_angstrom']:.3f}")

        if width == 390:
            jump.press("Enter")
            expect(result.get_by_role("region", name="对齐详情")).to_be_focused()
        if width == 1440:
            expand = scene.get_by_role("button", name="Expand research workspace")
            expand.click()
            expect(result.locator(".structure-workbench[data-workspace-expanded]")).to_be_visible()
            assert original_frame.evaluate("(frame) => frame.isConnected")
            page.keyboard.press("Escape")
            expect(expand).to_be_focused()
            expect(picker).to_have_value(str(aligned["index"]))
            verify_figure(page, figure)
        assert original_frame.evaluate("(frame) => frame.isConnected")
        download = result.get_by_role("link", name=label(
            "Download aligned structure", "下载对齐结构",
        ))
        url = urlsplit(download.get_attribute("href") or "")
        assert url.path == f"/api/jobs/{job}/download"
        assert parse_qs(url.query) == {"name": [aligned["artifact"]]}
        with page.expect_download() as artifact:
            download.click()
        digest = hashlib.sha256(artifact.value.path().read_bytes()).hexdigest()
        assert digest == aligned["artifact_sha256"]
        assert read(f"jobs/{job}/result").json() == native
        assert not writes and not errors
        browser.close()


def verify_figure(page, control):
    control.click()
    dialog = page.get_by_role("dialog", name="Export research figure")
    export = dialog.get_by_role("button", name="Export PNG")
    expect(export).to_be_enabled(timeout=30000)
    src = dialog.locator("img").get_attribute("src")
    assert src and src.startswith("data:image/png;base64,")
    with page.expect_download() as event:
        export.click()
    path = EVIDENCE / "stat6-receptor-overlay.png"
    event.value.save_as(path)
    raw = path.read_bytes()
    assert raw == base64.b64decode(src.partition(",")[2], validate=True)
    assert struct.unpack_from(">II", raw, 16) == (2102, 2102)
    offset = 8
    while offset + 12 <= len(raw):
        size, kind = struct.unpack_from(">I4s", raw, offset)
        if kind == b"pHYs":
            x, y, unit = struct.unpack_from(">IIB", raw, offset + 8)
            assert unit == 1 and round(x * 0.0254) == round(y * 0.0254) == 600
            break
        offset += size + 12
    else:
        raise AssertionError("Downloaded PNG is missing resolution metadata")
