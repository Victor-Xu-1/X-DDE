"""Use the retained STAT6 preparation artifact; generate no scientific results."""

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.publication_browser_helpers import export_figure, inspect_png

EVIDENCE = Path("server_tests/evidence/ensemble/preparation")


def check_summary(page, region, native, label):
    def value(label_text, expected):
        field = region.locator("dl > div").filter(
            has=page.get_by_text(label_text, exact=True),
        )
        expect(field.locator("dd")).to_have_text(str(expected))

    if native["operation"] == "structure_prepare":
        value(label("Atoms", "原子数"), native["atom_count"])
        value(label("Format", "格式"), "mmCIF" if native["options"]["format"] == "cif" else "PDB")
        chains = native["inspection"]["selected_chains"]
        if chains:
            value(label("Selected source chains", "选用的原始链"), ", ".join(chains))
        region.locator("summary").click()
        expect(region.locator("details > p").first).to_contain_text(str(len(native["removed_residues"])))
    else:
        value(label("Input atoms", "原始原子"), native["input_atoms"])
        value(label("Retained atoms", "保留原子"), native["output_atoms"])
        value(label("Removed atoms", "移除原子"), native["removed_atoms"])
        if native.get("notes"):
            notes = region.locator(".result-method-notes")
            expect(notes).to_have_count(1)
            notes.locator("summary").click()
            expect(notes.locator("p")).to_have_text(native["notes"])


@pytest.mark.parametrize("capability", ["biopython.prepare", "diffsbdd.prepare"])
@pytest.mark.parametrize(("width", "height", "language", "visible"), [
    (1440, 900, "en", 0.85), (1110, 580, "en", 0.38),
    (390, 775, "zh", 0.55), (320, 568, "en", 0.18),
])
def test_saved_preparation_layout_and_native_artifact(width, height, language, visible, capability):
    evidence = EVIDENCE / capability
    evidence.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"].rstrip("/")

    def label(en, zh):
        return zh if language == "zh" else en

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
            return response.json()

        page.route("**/api/**", read_only)
        example = read(f"examples/{capability}")
        assert example["study"]["id"] == "stat6"
        pin = example["pin"]
        job = pin["job_id"]
        native = read(f"jobs/{job}/result")
        if capability == "biopython.prepare":
            assert native["operation"] == "structure_prepare"
            artifact = native["artifact"]
            assert native["sha256"] == pin["artifact_sha256"][artifact]
        else:
            assert native["operation"] == "diffsbdd" and native["mode"] == "prepare"
            artifact = native["structure"]
        page.goto(f"{base}/#task={job}")
        root = page.locator(".prepared-structure-workspace")
        scene = root.locator(".structure-workbench-view")
        details = root.get_by_role("region", name=label("Prepared structure", "处理后的结构"))
        stage = scene.locator(".molecular-stage iframe")
        figure = scene.get_by_role("button", name=label("Export figure ↓", "文献图导出 ↓"), exact=True)
        expect(figure).to_be_enabled(timeout=30000)
        expect(page.locator(".operation-results .molecular-stage iframe")).to_have_count(1)
        expect(stage).to_be_in_viewport(ratio=visible)
        canvas, view, info = stage.bounding_box(), scene.bounding_box(), details.bounding_box()
        assert canvas and view and info
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert canvas["x"] + canvas["width"] <= width
        if width > 1000:
            assert view["width"] > 1.45 * info["width"]
            assert abs(view["y"] - info["y"]) < 3
            assert view["x"] + view["width"] <= info["x"]
        else:
            assert canvas["y"] + canvas["height"] <= info["y"]
        page.screenshot(path=evidence / f"stat6-preparation-{width}.png")
        (evidence / f"stat6-preparation-{width}.json").write_text(json.dumps({
            "job": job, "viewport": [width, height], "canvas": canvas,
            "visible_pixels": max(0, min(height, canvas["y"] + canvas["height"]) - canvas["y"]),
        }, indent=2))

        original = stage.element_handle()
        assert original
        backbone = scene.get_by_role("button", name=label("Backbone", "整体骨架"), exact=True)
        backbone.click()
        expect(backbone).to_have_attribute("aria-pressed", "true")
        expect(figure).to_be_enabled(timeout=30000)
        expand = scene.get_by_role("button", name=label("Expand research workspace", "展开研究工作区"))
        expand.click()
        close = scene.get_by_role("button", name=label("Close expanded view", "关闭展开视图"))
        expect(close).to_be_visible()
        assert original.evaluate("node => node.isConnected")
        close.click()
        expect(expand).to_be_focused()
        assert stage.evaluate("(current, original) => current === original", original)

        if width == 1440:
            path = export_figure(page, figure, evidence, "stat6-preparation-figure", language)
            inspect_png(path)

        check_summary(page, details, native, label)
        download = details.get_by_role("link", name=label("Download structure", "下载结构"), exact=True)
        url = urlsplit(download.get_attribute("href") or "")
        assert url.path == f"/api/jobs/{job}/download"
        assert parse_qs(url.query) == {"name": [artifact]}
        with page.expect_download() as original_file:
            download.click()
        assert hashlib.sha256(original_file.value.path().read_bytes()).hexdigest() == pin["artifact_sha256"][artifact]
        assert read(f"jobs/{job}/result") == native
        assert not writes and not errors
        browser.close()
