"""Read sealed preparation outputs in Chrome without creating new tasks."""

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/prepared-inputs")


@pytest.mark.parametrize("capability,width,height,language", [
    ("features", 1440, 900, "en"),
    ("features", 390, 775, "zh"),
    ("features", 320, 568, "en"),
    ("import", 1440, 900, "en"),
    ("import", 390, 775, "zh"),
])
def test_saved_prediction_inputs_keep_native_materials_and_downloads(capability, width, height, language):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
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
        result = read(f"jobs/{job}/result")
        request = read(f"jobs/{job}")["request"]
        assert len(result["documents"]) == 1
        artifact = result["documents"][0]
        page.goto(f"{base}/#task={job}")
        workspace = page.get_by_role("region", name=label("Prepared prediction inputs", "准备好的预测输入"))
        residues = workspace.locator(".sequence-residue-grid")
        expect(residues.locator('[data-position="1"]')).to_be_visible()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        canvas = workspace.locator(".molecular-stage iframe")
        if capability == "features":
            assert request["operation"] in {"msa", "mt", "prep"}
            expect(workspace.get_by_role("heading", name=label("Protein sequence", "蛋白序列"))).to_be_visible()
            expect(workspace.get_by_role("tablist")).to_have_count(0)
            expect(canvas).to_have_count(0)
            expect(residues.locator('[data-position="1"]')).to_be_in_viewport(ratio=0.9)
        else:
            assert request["operation"] == "json"
            source = workspace.get_by_role("region", name=label("Original input structure", "原始输入结构"))
            expect(source.get_by_role("button", name=label("Export figure ↓", "文献图导出 ↓"))).to_be_enabled(timeout=30000)
            expect(canvas).to_have_count(1)
            model, sequence = source.bounding_box(), residues.bounding_box()
            assert model and sequence
            if width > 1000:
                assert model["x"] + model["width"] <= sequence["x"]
            else:
                assert model["y"] + model["height"] <= sequence["y"]

        box = residues.bounding_box()
        assert box
        stem = EVIDENCE / f"{capability}-{width}"
        page.screenshot(path=stem.with_suffix(".png"))
        stem.with_suffix(".json").write_text(json.dumps({
            "job": job, "viewport": [width, height], "residue_grid": box,
        }, indent=2))

        link = workspace.get_by_role("link", name=label("Prediction input 1 · JSON", "预测输入 1 · JSON"))
        url = urlsplit(link.get_attribute("href") or "")
        assert url.path == f"/api/jobs/{job}/download"
        assert parse_qs(url.query) == {"name": [artifact]}
        with page.expect_download() as archive:
            link.click()
        raw = archive.value.path().read_bytes()
        assert hashlib.sha256(raw).hexdigest() == pin["artifact_sha256"][artifact]

        if capability == "features":
            sequence = request["components"][0]["value"]
        else:
            original = json.loads(raw)
            if isinstance(original, list):
                original = original[0]
            sequence = original["sequences"][0]["proteinChain"]["sequence"]
            first = workspace.get_by_role("tab", name=label("Component 1", "组分 1"))
            second = workspace.get_by_role("tab", name=label("Component 2", "组分 2"))
            first.press("ArrowRight")
            expect(second).to_be_focused()
            expect(workspace.get_by_text(label("Chemical component:", "化学组分："), exact=False)).to_be_visible()
            second.press("ArrowLeft")
            expect(first).to_be_focused()

        start = residues.locator('[data-position="1"]')
        start.press("ArrowRight")
        expect(residues.locator('[data-position="2"]')).to_be_focused()
        expect(residues.locator('[data-position="2"]')).to_have_attribute("aria-pressed", "true")
        with page.expect_download() as fasta:
            workspace.get_by_role("button", name=label("Download this sequence FASTA", "下载此序列 FASTA")).click()
        lines = fasta.value.path().read_text(encoding="utf-8").splitlines()
        assert lines[0].startswith(">") and "".join(lines[1:]) == sequence
        assert read(f"jobs/{job}/result") == result
        assert not writes and not errors
        browser.close()
