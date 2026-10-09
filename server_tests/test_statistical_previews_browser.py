"""Interactive retained DEL outputs; no scientific execution."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_svg


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
        case = page.request.get(base + "/api/examples/" + capability).json()
        assert case["pin"], "This gate needs the genuine retained native case"
        page.goto(base + "/#task=" + case["pin"]["job_id"])
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
            (evidence / (language + "-case.json")).write_text(
                json.dumps(case, ensure_ascii=False), encoding="utf-8"
            )
            (evidence / (language + "-job.json")).write_text(
                page.request.get(base + "/api/jobs/" + case["pin"]["job_id"]).text(),
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
            page.mouse.move(
                bounds["x"] + bounds["width"] / columns / 2,
                bounds["y"] + bounds["height"] / rows / 2,
            )
            expect(plot.locator(".hoverlayer .hovertext").first).to_be_visible()
            expect(plot.locator(".hoverlayer")).to_contain_text(
                "Enrichment" if language == "en" else "富集"
            )
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
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            chart.scroll_into_view_if_needed()
            page.wait_for_function(
                "() => document.documentElement.scrollWidth <= innerWidth + 1", timeout=5000
            )
            page.screenshot(path=str(evidence / f"{language}-{width}.png"), full_page=False)
        assert not errors and not scientific_posts
        assert before == page.request.get(base + "/api/jobs").json()
        browser.close()
