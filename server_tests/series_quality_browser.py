"""Inspect retained mono/disynthon artifacts through native web controls, without inference."""

import json

from playwright.sync_api import expect

from server_tests.publication_browser_helpers import export_figure, inspect_svg


def check_series_quality(page, root, base, identifier, evidence, language):
    zh = language == "zh"
    native = page.request.get(base + f"/api/datasets/{identifier}/table?view=series&limit=1").json()
    block = native["rows"][0]["block_a"]
    root.get_by_role("button", name="结果探索" if zh else "Results", exact=True).click()
    search = root.get_by_role("searchbox", name="搜索砌块" if zh else "Search building blocks")
    search.fill(block)
    expected = page.request.get(
        base + f"/api/datasets/{identifier}/table",
        params={
            "view": "series",
            "search": block,
            "series_kind": "mono",
            "limit": 20,
        },
    ).json()
    root.get_by_role("combobox", name="系列类型" if zh else "Series type").select_option("mono")
    rows = root.locator(".dataset-series-table tbody tr")
    expect(rows).to_have_count(len(expected["rows"]), timeout=30000)
    for index, row in enumerate(expected["rows"]):
        expect(rows.nth(index)).to_contain_text(row["block_a"])
        expect(rows.nth(index)).to_contain_text("单砌块" if zh else "Monosynthon")
    search.fill("no-matching-block")
    expect(rows).to_have_count(0, timeout=30000)
    search.fill("")
    root.get_by_role(
        "button", name="图表与质量" if zh else "Charts and quality", exact=True
    ).click()
    root.get_by_role("button", name="单砌块富集" if zh else "Monosynthons", exact=True).click()
    result = page.request.get(base + f"/api/jobs/{identifier}/result").json()
    artifact = next(
        item for item in result["artifacts"] if item["role"] == "del_series_visualization"
    )
    original = page.request.get(
        base + f"/api/jobs/{identifier}/download", params={"name": artifact["name"]}
    ).json()
    mono = [row for row in original["series"] if row["kind"] == "mono"]
    if not mono:
        expect(
            root.get_by_text(
                "此图表文件未报告单砌块" if zh else "This chart file reports no monosynthons",
                exact=False,
            )
        ).to_be_visible()
        root.get_by_role("button", name="双砌块热图" if zh else "Disynthon map").click()
        return
    cycle = root.get_by_role("combobox", name="库周期" if zh else "Library cycle")
    root.get_by_role("combobox", name="显示数量" if zh else "Display count").select_option("all")
    chosen = cycle.input_value()
    expected_mono = sorted(
        (row for row in mono if str(row.get("cycle_a", "reported")) == chosen),
        key=lambda row: (-row["score"], row["block_a"]),
    )
    plot = root.locator(".research-plot-canvas").first
    expect(plot).to_have_attribute("aria-busy", "false", timeout=30000)
    traces = plot.evaluate("el => el.data")
    assert traces[1]["x"] == [row["score"] for row in expected_mono]
    assert traces[1]["y"] == [row["block_a"] for row in expected_mono]
    (evidence / (language + "-mono-native-traces.json")).write_text(
        json.dumps(traces), encoding="utf-8"
    )
    chart = root.locator(".research-plot").first
    svg = export_figure(
        page,
        chart.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓"),
        evidence,
        language + "-mono-native",
        language,
        "SVG",
    )
    inspect_svg(svg, "")
