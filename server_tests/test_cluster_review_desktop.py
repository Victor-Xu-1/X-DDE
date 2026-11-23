"""Read the accepted binding-mode result without running another clustering job."""

from pathlib import Path
from xml.etree import ElementTree

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure


@pytest.mark.parametrize(("language", "height"), [("en", 600), ("zh", 580)])
def test_compact_pose_inspector_and_linked_overlay(language, height):
    zh = language == "zh"
    evidence = Path("outputs/cluster-review-desktop")
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / f"{language}.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1001, "height": height})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: writes.append(request.url)
            if request.url.startswith(base + "/api/") and request.method not in {"GET", "HEAD"}
            else None,
        )
        pin = page.request.get(base + "/api/examples/pose.cluster?profile=archive").json()["pin"]
        job_id = pin["job_id"]
        before = page.request.get(base + "/api/jobs").json()
        result = page.request.get(base + f"/api/jobs/{job_id}/result").json()
        page.goto(base + "/#task=" + job_id)
        root = page.locator(".cluster-results")
        capture = root.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=45000)
        table = root.get_by_role("table")
        expect(table).to_be_visible()
        assert table.evaluate(
            """table => {
              const scroll = table.parentElement;
              return scroll.scrollWidth <= scroll.clientWidth + 1
                && table.tBodies[0].rows[0].getBoundingClientRect().bottom <= innerHeight;
            }"""
        )
        stage = root.locator(".molecular-stage iframe")
        assert stage.evaluate(
            """frame => {
              const r = frame.getBoundingClientRect();
              const rail = document.querySelector(".cluster-analysis").getBoundingClientRect();
              return r.height >= 275 && r.top >= 0 && r.bottom <= innerHeight
                && r.right < rail.left && r.width > rail.width;
            }"""
        )
        page.screenshot(path=evidence / f"{language}-poses.png")

        root.get_by_role("tab", name="配对" if zh else "Pairs", exact=True).click()
        pair = result["pairs"][0]
        label = f"{pair['left'] + 1} ↔ {pair['right'] + 1}"
        pair_row = root.get_by_role("button", name=label, exact=True)
        pair_row.click()
        expect(pair_row).to_have_attribute("aria-pressed", "true")
        expect(capture).to_be_enabled(timeout=45000)
        assert root.get_by_role("table").evaluate(
            "table => table.parentElement.scrollWidth <= table.parentElement.clientWidth + 1"
        )
        stage.evaluate("node => { node.dataset.reviewReceipt = 'selected-pair'; }")
        root.get_by_role("tab", name="比较图" if zh else "Map", exact=True).click()
        canvas = root.locator(".cluster-matrix")
        expect(canvas.locator('g[aria-pressed="true"]')).to_have_count(2)
        expect(stage).to_have_attribute("data-review-receipt", "selected-pair")

        if not zh:
            svg = export_figure(
                page,
                canvas.get_by_role("button", name="Export figure ↓"),
                evidence,
                "pose-comparison",
                language,
                format="SVG",
            )
            figure = ElementTree.fromstring(svg.read_bytes())
            marks = figure.findall(
                './/svg:g[@aria-pressed="true"]/svg:rect',
                {"svg": "http://www.w3.org/2000/svg"},
            )
            assert len(marks) == 2 and all(rect.attrib.get("stroke") for rect in marks)

        root.get_by_role("tab", name="接触" if zh else "Contacts", exact=True).click()
        expect(root.locator(".cluster-contact-context")).to_contain_text(
            ("姿势 " if zh else "Pose ") + str(pair["left"] + 1)
        )
        expect(stage).to_have_attribute("data-review-receipt", "selected-pair")
        root.get_by_role(
            "button", name="返回单个姿势" if zh else "Return to single pose", exact=True
        ).click()
        expect(root.get_by_role("tab", name="姿势" if zh else "Poses", exact=True)).to_have_attribute(
            "aria-selected", "true"
        )
        expect(capture).to_be_enabled(timeout=45000)
        assert before == page.request.get(base + "/api/jobs").json()
        assert not writes and not errors
        browser.close()
