"""Inspect archived native ADMET results and inputs without scientific recomputation."""

import hashlib
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect

from server_tests.landscape_browser_helpers import choose_native_point
from server_tests.publication_browser_helpers import export_figure
from server_tests.test_navigation_shell_browser import settings
from server_tests.test_template_controls_browser import CASES, open_case
from server_tests.test_template_controls_browser import case_page as case_page

EVIDENCE = Path("server_tests/evidence/admet-inspection")


def capture(page, name):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=EVIDENCE / (name + ".png"), full_page=True)
    page.screenshot(path=EVIDENCE / (name + "-viewport.png"))
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), name


def native_result(page, language):
    region = open_case(page, language, "admet.predict", CASES[1][1])
    region.get_by_role(
        "button", name="示例结果" if language == "zh" else "Example results", exact=True
    ).click()
    result = page.get_by_role(
        "region",
        name="性质与早期安全性预测结果" if language == "zh" else "ADMET prediction results",
        exact=True,
    )
    expect(result).to_be_visible()
    base = os.environ["WB_BROWSER_URL"]
    info = page.request.get(base + "/api/examples/admet.predict").json()
    job_id = info["pin"]["job_id"]
    response = page.request.get(base + f"/api/jobs/{job_id}/result")
    assert response.ok
    report = response.json()
    assert report["models_executed"] is True
    assert len(report["endpoints"]) == 41 and report["predicted_count"] == 3
    assert len(report["rows"]) == 3 and all(row["status"] == "predicted" for row in report["rows"])
    return region, result, job_id, report


def test_native_units_selection_all_endpoints_and_view_exports(case_page):
    page, language, width = case_page
    zh = language == "zh"
    _, result, job_id, report = native_result(page, language)
    selected = result.get_by_role(
        "region", name="所选分子" if zh else "Selected molecule", exact=True
    )
    expect(
        selected.get_by_role("tab", name="预测性质" if zh else "Predictions", exact=True)
    ).to_have_attribute("aria-selected", "true")
    selected.scroll_into_view_if_needed()
    expect(selected.locator(".molecule-image")).to_have_attribute(
        "data-drawing-state", "ready", timeout=45000
    )
    drawing = selected.locator(".molecule-image img")
    bounds = drawing.bounding_box()
    parent = selected.locator(".admet-molecule-drawing").bounding_box()
    assert bounds and parent and bounds["width"] <= parent["width"] + 1
    expect(result.locator(".molecule-image.is-thumbnail").first).to_have_attribute(
        "data-drawing-state", "ready", timeout=45000
    )
    expect(selected.locator(".molecular-stage")).to_have_count(0)
    units = result.get_by_role(
        "region", name="候选分子" if zh else "Candidate molecules", exact=True
    ).locator("thead")
    expect(units).to_contain_text("log(mol/L)")
    expect(units).to_contain_text("log-ratio")
    capture(page, f"{language}-{width}-predictions")
    grouping = selected.get_by_role(
        "combobox", name="结果分组" if zh else "Result group", exact=True
    )
    grouping.select_option("all")
    table = selected.locator(".admet-endpoints table").first
    expect(table.locator("tbody tr")).to_have_count(41)
    for endpoint in report["endpoints"]:
        entry = table.locator('[data-endpoint-id="' + endpoint["id"] + '"]')
        value = report["rows"][0]["predictions"][endpoint["id"]]
        displayed = entry.locator("td").nth(1).inner_text()
        assert abs(float(displayed) - value) <= max(0.00005, abs(value) * 0.0006)
        unit = (
            ("分数 0–1" if zh else "Score 0–1")
            if endpoint["task_type"] == "classification"
            else endpoint["unit"]
        )
        expect(entry.locator("td").nth(2)).to_have_text(unit)
    grouping.select_option("Toxicity")
    expect(table.locator("tbody tr")).to_have_count(
        sum(e["category"] == "Toxicity" for e in report["endpoints"])
    )
    grouping.select_option("common")
    result.get_by_role("tab", name="性质分布" if zh else "Property landscape", exact=True).click()
    chart = result.get_by_role(
        "region", name="候选性质对比" if zh else "Candidate property landscape", exact=True
    )
    last = report["rows"][-1]
    plot = chart.get_by_role("application")
    expect(plot).to_have_attribute("aria-busy", "false", timeout=30000)
    choose_native_point(page, plot, len(report["rows"]) - 1)
    expect(
        selected.get_by_role("heading", name=f"#{last['record'] + 1} · {last['name']}", exact=True)
    ).to_be_visible()
    selected.scroll_into_view_if_needed()
    expect(selected.locator(".molecule-image")).to_have_attribute(
        "data-drawing-state", "ready", timeout=45000
    )
    chart.get_by_role("combobox", name="横轴" if zh else "X axis", exact=True).select_option("hERG")
    capture(page, f"{language}-{width}-landscape")
    figure = export_figure(
        page,
        chart.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True),
        EVIDENCE,
        f"{language}-{width}-landscape",
        language,
        "SVG",
    )
    assert b"<svg" in figure.read_bytes()
    result.get_by_role("tab", name=re.compile("^(候选分子|Candidate molecules)")).click()
    # Initial 3D calculation is accepted by the isolated native pose gate; this
    # inspection gate checks original model predictions without recomputation.
    csv = page.request.get(
        os.environ["WB_BROWSER_URL"] + f"/api/jobs/{job_id}/download?name=predictions.csv"
    )
    assert csv.ok and hashlib.sha256(csv.body()).hexdigest() == report["csv_sha256"]
    source = page.request.get(
        os.environ["WB_BROWSER_URL"] + "/api/assets/" + report["source"]["asset_id"]
    )
    assert source.ok and hashlib.sha256(source.body()).hexdigest() == report["source"]["sha256"]
    capture(page, f"{language}-{width}-returned-predictions")
    (EVIDENCE / f"{language}-{width}-source-evidence.json").write_text(
        json.dumps(
            {
                "job_id": job_id,
                "endpoint_count": 41,
                "source_verified": True,
                "csv_verified": True,
                "record_selected": last["record"],
                "scientific_recomputation": False,
            },
            indent=2,
        )
    )


def test_questionnaire_preserves_preference_and_public_preview_context(case_page):
    page, language, width = case_page
    zh = language == "zh"
    region, _, _, _ = native_result(page, language)
    region.get_by_role(
        "button", name="使用此模板" if zh else "Use this template", exact=True
    ).click()
    form = page.locator(".questionnaire:visible")
    expect(form.locator("fieldset:not([hidden])")).to_have_count(1)
    form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    expect(form.get_by_role("button", name="下一步" if zh else "Next", exact=True)).to_be_enabled(
        timeout=30000
    )
    capture(page, f"{language}-{width}-inputs")
    form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    form.get_by_role("radio", name="早期安全性" if zh else "Early safety", exact=True).check()
    form.get_by_role(
        "textbox", name="任务名称（可选）" if zh else "Task name (optional)", exact=True
    ).fill("ABL inhibitor safety comparison")
    expect(form.locator("fieldset:not([hidden]) details[open]")).to_have_count(0)
    capture(page, f"{language}-{width}-settings")
    form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    expect(form.locator("fieldset:not([hidden])")).to_have_count(1)
    capture(page, f"{language}-{width}-review")
    form.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
    expect(
        form.get_by_role("radio", name="早期安全性" if zh else "Early safety", exact=True)
    ).to_be_checked()
    expect(
        form.get_by_role(
            "textbox", name="任务名称（可选）" if zh else "Task name (optional)", exact=True
        )
    ).to_have_value("ABL inhibitor safety comparison")
    if width == 390:
        settings(page, language)
        page.get_by_role("radio", name="深色" if zh else "Dark", exact=True).check()
        _, result, _, _ = native_result(page, language)
        result.locator(".admet-selected-molecule").scroll_into_view_if_needed()
        expect(result.locator(".admet-molecule-drawing .molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=45000
        )
        capture(page, f"{language}-{width}-dark-predictions")
