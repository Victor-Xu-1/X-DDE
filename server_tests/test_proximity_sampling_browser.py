"""Inspect the real forty-assembly capacity case without creating more jobs."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from browser_platform import platform
from example_preview_actions import ready_structure
from playwright.sync_api import expect, sync_playwright


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_forty_assemblies_retain_selection_and_original_downloads(language, width):
    root = Path(os.environ["WB_PROXIMITY_CASE"])
    accepted = json.loads((root / "acceptance.json").read_text())
    native = json.loads((root / "result.json").read_text())
    assert accepted["assemblies"] == 40 and not accepted["example_pinned"]
    proposals = native["proximity"]["assemblies"]
    assert len(proposals) == 40
    evidence = root / ("sampling-browser-" + language)
    evidence.mkdir()
    errors, submissions = [], []
    zh = language == "zh"
    with platform(root / "state", evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base + "/#task=" + accepted["job_id"])
        table = page.get_by_role("table", name="装配比较" if zh else "Compare assemblies")
        expect(table.locator("tbody tr")).to_have_count(20)
        page.get_by_role("button", name="下一页" if zh else "Next page", exact=True).click()
        expect(table.locator("tbody tr")).to_have_count(20)
        table.get_by_role("button", name="装配 40" if zh else "Assembly 40", exact=True).click()
        active = proposals[39]
        ready_structure(page, zh)
        link = page.get_by_role(
            "link", name="下载分子 SDF" if zh else "Download molecule SDF", exact=True
        )
        expected = f"/api/jobs/{accepted['job_id']}/download?name={active['ligand_artifact']}"
        expect(link).to_have_attribute("href", expected)
        with page.expect_download() as pending:
            link.click()
        pending.value.save_as(evidence / active["ligand_artifact"])
        downloaded = (evidence / active["ligand_artifact"]).read_bytes()
        assert (
            hashlib.sha256(downloaded).hexdigest()
            == native["artifact_sha256"][active["ligand_artifact"]]
        )
        complex_link = page.get_by_role(
            "link", name="下载完整复合物" if zh else "Download complete complex", exact=True
        )
        expect(complex_link).to_have_attribute(
            "href",
            f"/api/jobs/{accepted['job_id']}/download?name={active['complex_artifact']}",
        )
        with page.expect_download() as complex_pending:
            complex_link.click()
        complex_pending.value.save_as(evidence / active["complex_artifact"])
        complex_downloaded = (evidence / active["complex_artifact"]).read_bytes()
        assert (
            hashlib.sha256(complex_downloaded).hexdigest()
            == native["artifact_sha256"][active["complex_artifact"]]
        )
        page.get_by_role("tab", name="分子三维" if zh else "Molecule 3D", exact=True).click()
        ready_structure(page, zh)
        page.screenshot(path=str(evidence / "selected-fortieth-ligand.png"), full_page=True)
        page.get_by_role("tab", name="完整复合物" if zh else "Complete complex", exact=True).click()
        ready_structure(page, zh)
        frame = page.locator(".proximity-assembly-preview iframe:visible")
        expect(frame.content_frame.locator("canvas")).to_be_visible(timeout=20000)
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=str(evidence / "selected-fortieth-assembly.png"), full_page=True)
        assert not errors and not submissions
        browser.close()
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "language": language,
                "assemblies": 40,
                "last_selection_id": active["id"],
                "download_sha256": hashlib.sha256(downloaded).hexdigest(),
                "complex_download_sha256": hashlib.sha256(complex_downloaded).hexdigest(),
                "loaded_preview_modes": ["complete_complex", "ligand"],
                "scientific_accuracy_accepted": False,
                "jobs_submitted_by_browser": 0,
            },
            indent=2,
        )
    )
