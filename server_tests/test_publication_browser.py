"""Real pinned BRD4 contacts through the shared viewer; no scientific execution."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png


@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_classic_figure_camera_and_source_integrity(language):
    from opendde_workbench.settings import Settings

    state = Settings.from_env().state_dir
    evidence = Path("outputs/publication-browser")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(state, evidence / (language + ".log")) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
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
        before = page.request.get(base + "/api/jobs").json()
        info = page.request.get(base + "/api/examples/diffsbdd.interactions").json()
        job_id = info["pin"]["job_id"]
        job = page.request.get(base + "/api/jobs/" + job_id).json()
        references = [job["request"]["payload"][key] for key in ("protein", "molecule")]
        original = {
            ref["asset_id"]: page.request.get(base + "/api/assets/" + ref["asset_id"]).body()
            for ref in references
        }
        page.goto(base + "/#task=" + job_id)
        panel = page.locator(".viewer-panel").first
        expect(
            panel.get_by_role(
                "button",
                name="Capture 3D view" if language == "en" else "生成三维视图图片",
                exact=True,
            )
        ).to_be_enabled(timeout=45000)
        # Real source residue, selected by keyboard; no synthetic contact/energy.
        residue = panel.get_by_role("button", name="A:ASN140", exact=True)
        if residue.count():
            residue.focus()
            residue.press("Enter")
        png = export_figure(
            page,
            panel.get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            language + "-brd4-figure",
            language,
        )
        inspect_png(png)
        expect(
            panel.get_by_role(
                "button",
                name="Capture 3D view" if language == "en" else "生成三维视图图片",
                exact=True,
            )
        ).to_be_enabled()
        page.screenshot(path=str(evidence / (language + "-restored.png")), full_page=False)
        for ref in references:
            assert (
                original[ref["asset_id"]]
                == page.request.get(base + "/api/assets/" + ref["asset_id"]).body()
            )
        assert before == page.request.get(base + "/api/jobs").json()
        assert not submissions and not errors
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("capability", ["pose.cluster", "caver.paths"])
def test_retained_matrix_and_channel_vectors(capability, language):
    from opendde_workbench.settings import Settings
    from server_tests.publication_browser_helpers import inspect_svg

    evidence = Path("outputs/publication-browser") / capability
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(
            Settings.from_env().state_dir.parent / "publication-cases" / capability,
            evidence / (language + ".log"),
        ) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
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
        before = page.request.get(base + "/api/jobs").json()
        info = page.request.get(base + "/api/examples/" + capability).json()
        assert info["pin"], "The retained native case must be present"
        page.goto(base + "/#task=" + info["pin"]["job_id"])
        if capability == "pose.cluster":
            region = page.get_by_role(
                "region",
                name="Binding mode clustering results" if language == "en" else "结合模式分群结果",
                exact=True,
            )
            chart = region.locator(".cluster-matrix")
        else:
            region = page.get_by_role(
                "region",
                name="Channel analysis results" if language == "en" else "通道分析结果",
                exact=True,
            )
            chart = region.locator(".channel-profile")
        expect(region).to_be_visible(timeout=30000)
        expect(chart).to_be_visible()
        original = chart.locator("svg").evaluate("node => node.outerHTML")
        svg = export_figure(
            page,
            chart.get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            language + "-native-vector",
            language,
            "SVG",
        )
        if capability == "caver.paths":
            inspect_svg(svg, "Å")
        else:
            import xml.etree.ElementTree as ET

            root = ET.fromstring(svg.read_bytes())
            assert root.attrib["width"] == "89mm"
            assert len(root.findall(".//{http://www.w3.org/2000/svg}rect")) > 2
        assert chart.locator("svg").evaluate("node => node.outerHTML") == original
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            chart.scroll_into_view_if_needed()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=str(evidence / f"{language}-{width}.png"), full_page=False)
        assert not errors and not submissions
        assert before == page.request.get(base + "/api/jobs").json()
        browser.close()
