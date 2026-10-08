"""Native MD/FEP output rendered by the actual app; no invented chart coordinates."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("case", ["openmm.dynamics", "openfe.rbfe", "openfe.calculation"])
@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_result_views_and_downloads(case, language):
    source = Path("outputs/native-simulations") / case
    assert (source / "state/jobs.sqlite3").is_file(), (
        "Run the exact native simulation fixture first."
    )
    identifier = (source / "job-id.txt").read_text()
    evidence = source / "browser"
    evidence.mkdir(exist_ok=True)
    with platform(source / "state", evidence / (language + ".log")) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/#task=" + identifier)
        root = page.get_by_test_id(
            "dynamics-results" if case == "openmm.dynamics" else "free-energy-results"
        )
        expect(root).to_be_visible(timeout=30000)
        if case == "openmm.dynamics":
            viewer = root.locator("iframe").first
            expect(viewer).to_be_visible()
            expect(root.locator("canvas")).to_have_count(0)
            # The molecular canvas lives in the real isolated viewer frame.
            expect(viewer.content_frame.locator("canvas").first).to_be_visible(timeout=30000)
            page.get_by_role(
                "slider", name="Trajectory time" if language == "en" else "轨迹时间"
            ).fill("3")
            expect(
                root.get_by_role(
                    "link", name="Download frame" if language == "en" else "下载当前结构"
                )
            ).to_have_attribute(
                "href", f"/api/jobs/{identifier}/download?name=repeat-1-frame-0004.pdb"
            )
            expect(
                root.get_by_role(
                    "img",
                    name="Residue fluctuations: Residue sequence position, RMSF (Å)"
                    if language == "en"
                    else "残基波动: 残基序列位置, RMSF (Å)",
                )
            ).to_be_visible()
        else:
            expect(
                root.get_by_role(
                    "img",
                    name="Relative binding free-energy perturbation network"
                    if language == "en"
                    else "相对结合自由能变化网络",
                )
            ).to_be_visible()
            # Native Ketcher 2D drawings are part of this actual result inspection.
            images = root.locator(".simulation-molecule-pair img")
            expect(images).to_have_count(2, timeout=30000)
            assert images.evaluate_all(
                "images => images.every(image => image.complete && image.naturalWidth > 0)"
            )
            if case == "openfe.calculation":
                root.get_by_role(
                    "tab", name="Sampling and convergence" if language == "en" else "采样与收敛"
                ).click()
                expect(root.get_by_role("img", name="MBAR overlap matrix")).to_be_visible()
                root.get_by_role(
                    "tab", name="Convergence" if language == "en" else "收敛曲线", exact=True
                ).click()
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            root.scroll_into_view_if_needed()
            page.screenshot(path=str(evidence / f"{language}-{width}-results.png"), full_page=True)
        assert not errors
        browser.close()
