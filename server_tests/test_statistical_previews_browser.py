"""Interactive retained DEL outputs; no scientific execution."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.barcode_quality_browser import check_barcode_quality
from server_tests.browser_platform import platform
from server_tests.decoding_quality_browser import check_decoding_quality
from server_tests.publication_browser_helpers import export_figure, inspect_svg
from server_tests.responsive_chart_browser import wait_for_responsive_width
from server_tests.series_quality_browser import check_series_quality


@pytest.mark.parametrize("language", ["en", "zh"])
def test_retained_enrichment_search_and_native_download(language):
    """Open the genuine archived native analysis; no scientific jobs are submitted."""
    evidence = Path("outputs/statistical-previews/del.analyze")
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / (language + ".log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        before = page.request.get(base + "/api/jobs").json()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        response = page.request.get(base + "/api/examples/del.analyze?profile=archive")
        assert response.ok
        case = response.json()
        identifier = case["pin"]["job_id"]
        result = page.request.get(base + "/api/jobs/" + identifier + "/result").json()
        comparison = result["metadata"]["chosen_comparison"]
        native = page.request.get(
            base
            + f"/api/datasets/{identifier}/table?view=enrichment&comparison={comparison}&limit=20"
        ).json()
        member = native["rows"][0]["member"]
        page.goto(base + "/#task=" + identifier)
        root = page.locator(".dataset-results")
        expect(root).to_be_visible(timeout=30000)
        search = root.get_by_role("searchbox")
        search.fill(member)
        table = root.locator(".dataset-enrichment-table")
        expect(table.locator("tbody tr")).to_have_count(1, timeout=30000)
        expect(table.locator("tbody tr")).to_contain_text(member)
        expect(
            root.get_by_role(
                "columnheader", name="Target-sample CV" if language == "en" else "靶点样本 CV"
            )
        ).to_be_visible()
        # Old native cases have no synthesized support columns or new defaults.
        expect(root.get_by_role("checkbox")).not_to_be_checked()
        root.locator(".dataset-download-menu > summary").click()
        with page.expect_download() as downloading:
            root.get_by_role("link", name="enrichment.csv", exact=False).click()
        download = downloading.value
        download.save_as(str(evidence / (language + "-enrichment.csv")))
        expected = next(item for item in result["artifacts"] if item["name"] == "enrichment.csv")
        saved = evidence / (language + "-enrichment.csv")
        assert saved.stat().st_size == expected["size"]
        with saved.open("rb") as stream:
            assert hashlib.file_digest(stream, "sha256").hexdigest() == expected["sha256"]
        page.screenshot(path=str(evidence / (language + "-native-table.png")), full_page=False)
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize(
    "capability", ["del.library", "del.decode", "del.count", "del.series", "del.model"]
)
def test_real_del_chart_values_interaction_and_figures(capability, language):
    evidence = Path("outputs/statistical-previews") / capability
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, evidence / (language + ".log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, scientific_posts = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                scientific_posts.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches", "/prepare"))
                else None
            ),
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        case = page.request.get(base + "/api/examples/" + capability + "?profile=archive").json()
        assert case["pin"], "This gate needs a verified archived native result"
        identifier = case["pin"]["job_id"]
        (evidence / (language + "-source.json")).write_text(
            json.dumps(
                {
                    "capability": capability,
                    "job_id": identifier,
                    "case_id": case["case"]["id"],
                    "artifact_sha256": case["pin"]["artifact_sha256"],
                    "source": "Verified archived native case; separate from the STAT6 template",
                }
            ),
            encoding="utf-8",
        )
        page.goto(base + "/#task=" + identifier)
        root = page.locator(".dataset-results")
        expect(root).to_be_visible(timeout=30000)
        charts_tab = root.get_by_role(
            "button", name="Charts and quality" if language == "en" else "图表与质量", exact=True
        )
        if charts_tab.count():
            charts_tab.click()
        chart = root.locator(".research-plot").first
        plot = chart.locator(".research-plot-canvas")
        try:
            expect(plot).to_have_attribute("aria-busy", "false", timeout=30000)
        except Exception:
            page.screenshot(path=str(evidence / (language + "-load-failure.png")), full_page=True)
            (evidence / (language + "-load-failure.txt")).write_text(
                page.content(), encoding="utf-8"
            )
            (evidence / (language + "-job.json")).write_text(
                page.request.get(base + "/api/jobs/" + identifier).text(),
                encoding="utf-8",
            )
            raise
        traces = plot.evaluate("el => JSON.parse(JSON.stringify(el.data))")
        assert traces and any(
            trace.get("x") or trace.get("y") or trace.get("z") for trace in traces
        )
        (evidence / (language + "-native-traces.json")).write_text(
            json.dumps(traces, ensure_ascii=False), encoding="utf-8"
        )
        plot.scroll_into_view_if_needed()
        kind = traces[0].get("type")
        if kind in {"bar", "scatter"}:
            marker = plot.locator(
                ".barlayer .point path" if kind == "bar" else ".scatterlayer .point"
            ).first
            bounds = marker.bounding_box()
            assert bounds
            page.mouse.move(
                bounds["x"] + bounds["width"] / 2,
                bounds["y"] + bounds["height"] / 2,
            )
            try:
                expect(plot.locator(".hoverlayer .hovertext").first).to_be_visible()
            except Exception:
                page.screenshot(
                    path=str(evidence / (language + "-hover-failure.png")), full_page=False
                )
                state = page.evaluate(
                    """({x,y}) => ({
                  hit: document.elementFromPoint(x,y)?.outerHTML.slice(0,500),
                  viewport: {width:innerWidth,height:innerHeight},
                  plots: Array.from(document.querySelectorAll('.js-plotly-plot')).map(el => ({
                    bounds:el.getBoundingClientRect().toJSON(),
                    svgs:Array.from(el.querySelectorAll('.main-svg'))
                      .map(s => s.getBoundingClientRect().toJSON())
                  })) })""",
                    {
                        "x": bounds["x"] + bounds["width"] / 2,
                        "y": bounds["y"] + bounds["height"] / 2,
                    },
                )
                (evidence / (language + "-hover-failure.json")).write_text(
                    json.dumps(state), encoding="utf-8"
                )
                raise
        elif kind == "heatmap":
            bounds = plot.locator(".heatmaplayer image").first.bounding_box()
            assert bounds
            columns, rows = len(traces[0]["x"]), len(traces[0]["y"])
            # Stable block ordering may place an unreported pair in the corner.
            # Exercise a real native cell, preserving gaps and measured zeroes.
            row, column = next(
                (i, j)
                for i, values in enumerate(traces[0]["z"])
                for j, value in enumerate(values)
                if value is not None
            )
            page.mouse.move(
                bounds["x"] + bounds["width"] * (column + 0.5) / columns,
                bounds["y"] + bounds["height"] * (row + 0.5) / rows,
            )
            expect(plot.locator(".hoverlayer .hovertext").first).to_be_visible()
            expect(plot.locator(".hoverlayer")).to_contain_text(
                "Enrichment" if language == "en" else "富集"
            )
            expect(plot.locator(".hoverlayer")).to_contain_text(traces[0]["y"][row])
            expect(plot.locator(".hoverlayer")).to_contain_text(traces[0]["x"][column])
        chart.get_by_role(
            "combobox", name="Chart interaction" if language == "en" else "图表操作"
        ).select_option("pan")
        expect(plot).to_have_attribute("aria-busy", "false", timeout=30000)
        assert plot.evaluate("el => el.layout.dragmode") == "pan"
        chart.get_by_role(
            "button", name="Reset" if language == "en" else "重置", exact=True
        ).click()
        svg = export_figure(
            page,
            chart.get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            language + "-native-chart",
            language,
            "SVG",
        )
        inspect_svg(svg, "")
        if capability == "del.library":
            check_barcode_quality(
                page, root, Settings.from_env().state_dir, identifier, evidence, language
            )
        if capability == "del.decode":
            check_decoding_quality(
                page, root, Settings.from_env().state_dir, identifier, evidence, language
            )
        if capability == "del.series":
            scale = root.get_by_role(
                "combobox", name="Color scale" if language == "en" else "颜色刻度"
            )
            expect(scale).to_have_value("log")
            scale.select_option("linear")
            expect(root.locator(".research-plot-canvas").last).to_have_attribute(
                "aria-busy", "false"
            )
            scale.select_option("log")
            expect(root.locator(".research-plot-canvas").last).to_have_attribute(
                "aria-busy", "false"
            )
        if capability == "del.series":
            check_series_quality(page, root, base, identifier, evidence, language)
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            chart.scroll_into_view_if_needed()
            wait_for_responsive_width(page)
            page.screenshot(path=str(evidence / f"{language}-{width}.png"), full_page=False)
        assert not errors and not scientific_posts
        assert before == page.request.get(base + "/api/jobs").json()
        browser.close()
