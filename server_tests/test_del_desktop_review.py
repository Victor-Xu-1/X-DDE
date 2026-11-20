"""Exercise the retained DEL results on short desktops."""

import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_candidate_inspection_desktop import dataset_candidate


def open_example(page, base, settings, capability, zh):
    detail = page.request.get(f"{base}/api/examples/{capability}")
    assert detail.ok and detail.json()["computed_result_available"]
    identifier = detail.json()["pin"]["job_id"]
    output = settings.state_dir / "jobs" / identifier / "output"
    page.goto(f"{base}/#view=new&tool={capability}")
    page.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
    panel = page.locator(".module-template.is-preview .dataset-results")
    expect(panel).to_be_visible(timeout=30_000)
    return panel, identifier, output


def check_enrichment(page, base, settings, zh, evidence):
    panel, identifier, output = open_example(page, base, settings, "del.analyze", zh)
    document = json.loads((output / "result.json").read_bytes())
    comparison = panel.get_by_role("combobox", name="选择比较" if zh else "Comparison")
    options = document["metadata"]["comparisons"]
    next_comparison = next(item["id"] for item in options if item["id"] != comparison.input_value())
    table = panel.locator(".dataset-enrichment-table")
    first = table.locator("tbody tr").first
    expect(first).to_be_visible(timeout=30_000)
    search = panel.get_by_role(
        "searchbox", name="搜索成员或货号" if zh else "Search members or IDs",
    )
    assert abs(comparison.bounding_box()["y"] - search.bounding_box()["y"]) < 12
    assert first.bounding_box()["height"] < 116
    third = table.locator("tbody tr").nth(2)
    box = third.bounding_box()
    assert box and box["y"] + box["height"] <= page.viewport_size["height"] + 1
    expect(third.locator(".dataset-column-member")).to_be_in_viewport(ratio=0.99)
    expect(third.locator(".dataset-column-score")).to_be_in_viewport(ratio=0.99)
    member_cell = first.locator(".dataset-column-member")
    before = member_cell.bounding_box()["x"]
    table.evaluate("table => { table.scrollLeft = 120; }")
    assert abs(member_cell.bounding_box()["x"] - before) <= 1
    table.evaluate("table => { table.scrollLeft = 0; }")
    page.screenshot(path=evidence / "hit-table.png")

    def table_request(response, **params):
        url = urlsplit(response.url)
        query = parse_qs(url.query)
        return response.ok and url.path == f"/api/datasets/{identifier}/table" and all(
            query.get(key) == [value] for key, value in params.items()
        )

    with page.expect_response(lambda response: table_request(response, comparison=next_comparison)):
        comparison.select_option(next_comparison)
    prioritize = panel.get_by_role(
        "checkbox",
        name="符合所选筛选条件" if zh else "Selected prioritization criteria",
    )
    expect(prioritize).to_be_checked()
    with page.expect_response(
        lambda response: table_request(response, prioritized="false"),
    ) as hits:
        prioritize.uncheck()
    member = hits.value.json()["rows"][0]["member"]
    with page.expect_response(lambda response: table_request(response, search=member)):
        search.fill(member)
    expect(first.locator(".dataset-column-member")).to_have_text(member)
    panel.get_by_role(
        "tab", name="候选结构" if zh else "Candidate structures", exact=True,
    ).click()
    expect(panel.locator(".candidate-inspection-preview")).to_be_in_viewport(ratio=0.15)
    panel.get_by_role("tab", name="结果探索" if zh else "Results", exact=True).click()
    expect(comparison).to_have_value(next_comparison)
    expect(search).to_have_value(member)
    expect(prioritize).not_to_be_checked()
    expect(first.locator(".dataset-column-member")).to_have_text(member)
    panel.get_by_role(
        "tab", name="图表与质量" if zh else "Charts and quality", exact=True,
    ).click()
    charts = panel.locator('[role="tabpanel"]:visible .dataset-chart-grid')
    expect(charts).to_be_visible(timeout=30_000)


def check_candidates(page, base, settings, width, height, zh, evidence):
    panel, _, output = open_example(page, base, settings, "del.candidates", zh)
    attempt = json.loads((output / "result.json").read_bytes())
    workbench = panel.locator(".structure-workbench:has([data-del-review])")
    frame = workbench.locator(".structure-workbench-view .viewer-panel iframe:visible")
    figure = workbench.locator(".figure-export-trigger:visible")
    expect(figure).to_be_enabled(timeout=45_000)
    expect(frame).to_be_in_viewport(ratio=0.99)
    box = frame.bounding_box()
    rail = workbench.locator(":scope > .structure-workbench-details").bounding_box()
    assert box and rail and box["width"] >= 480 and box["height"] >= 330, box
    assert box["x"] + box["width"] < rail["x"] and rail["x"] + rail["width"] <= width
    assert box["y"] >= 0 and box["y"] + box["height"] <= height + 1
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    preview = workbench.locator(".molecular-preview")
    drawing = preview.get_by_role(
        "tab", name="二维结构" if zh else "2D structure", exact=True,
    )
    structure = preview.get_by_role(
        "tab", name="三维结构" if zh else "3D structure", exact=True,
    )
    expect(drawing).to_have_text("二维" if zh else "2D")
    expect(structure).to_have_text("三维" if zh else "3D")
    page.screenshot(path=evidence / "candidate-review.png")
    dataset_candidate(page, workbench, frame, figure, output, attempt, "del.candidates", zh)
    if not zh:
        inspect_png(export_figure(page, figure, evidence, "del-candidate", "en"))


def check_library(page, base, settings, zh, evidence):
    panel, _, _ = open_example(page, base, settings, "del.library", zh)
    articles = panel.locator(".dataset-block-grid article")
    for index in range(3):
        card = articles.nth(index)
        drawing = card.get_by_role("img")
        expect(drawing).to_be_in_viewport(ratio=0.94, timeout=30_000)
        drawing_box = drawing.bounding_box()
        card_box = card.bounding_box()
        assert drawing_box["y"] + drawing_box["height"] <= card_box["y"] + card_box["height"]
    page.screenshot(path=evidence / "library-definition.png")

    panel, _, _ = open_example(page, base, settings, "del.enumerate", zh)
    inspection = panel.locator(".dataset-member-inspector")
    member = panel.locator(".dataset-library-table tbody tr").nth(1).locator(".dataset-row-title")
    expect(member).to_be_visible(timeout=30_000)
    selected = member.inner_text().strip()
    member.click()
    expect(inspection.get_by_role("heading")).to_have_text(selected)
    expect(inspection.get_by_role("img")).to_be_in_viewport(ratio=0.95, timeout=30_000)
    expect(panel.locator(".structure-workbench")).to_have_count(1)
    page.screenshot(path=evidence / "library-member.png")
    structures = panel.get_by_role("tab", name="候选结构" if zh else "Candidate structures")
    structures.click()
    preview = panel.locator(".candidate-inspection-preview")
    expect(preview.locator(".molecule-inspection-view img")).to_be_in_viewport(
        ratio=0.95, timeout=30_000,
    )
    expect(panel.locator(".structure-workbench:visible")).to_have_count(1)
    page.screenshot(path=evidence / "library-candidate.png")
    panel.get_by_role("tab", name="库成员" if zh else "Library members", exact=True).click()
    expect(inspection.get_by_role("heading")).to_have_text(selected)
    expect(panel.locator(".structure-workbench:visible")).to_have_count(1)


def check_evidence_tables(page, base, settings, zh, evidence):
    for capability, kind, count in (
        ("del.decode", "decoded", 7),
        ("del.count", "counts", 5),
        ("del.series", "series", 7),
        ("del.followup", "followup", 1),
    ):
        panel, _, _ = open_example(page, base, settings, capability, zh)
        if kind == "series":
            expect(panel.locator(".dataset-series-source")).to_contain_text("PCR")
        if kind in {"decoded", "counts"}:
            tabs = panel.locator(".research-tab-toolbar")
            expect(tabs.locator(".dataset-download-menu > summary")).to_be_visible()
        table = panel.locator(f".dataset-{kind}-table")
        expect(table.locator("tbody tr").nth(count - 1).locator("td").first).to_be_in_viewport(
            ratio=0.99, timeout=30_000,
        )
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=evidence / f"{kind}-evidence.png")
        if kind == "series":
            interpretation = panel.locator(".dataset-series-context details")
            expect(interpretation).not_to_have_attribute("open", "")
            interpretation.locator("summary").press("Space")
            expect(interpretation.locator("p").last).to_contain_text(
                "生物学重复性需单独验证" if zh else "biological reproducibility require separate evidence"
            )


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1180, 720),
    ("zh", "dark", 1440, 800),
])
def test_del_desktop_review(language, theme, width, height):
    settings = Settings.from_env()
    evidence = Path("outputs/del-desktop-review") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(settings.state_dir, evidence / "app.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": width, "height": height}, accept_downloads=True,
        )
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
          localStorage.setItem('x-dde-theme', '{theme}');
          window.addEventListener('message', event => {{
            if (event.origin === location.origin && event.source === window.parent &&
                event.data?.channel === 'opendde-viewer' && event.data.type === 'load') {{
              window.__candidateLoad = structuredClone(event.data.value);
              const record = event.data.value.records?.at(-1);
              document.documentElement.dataset.loadRecord = String(record);
            }}
          }});""")
        writes = []

        def readonly(route):
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", readonly)
        runtime = f"{base}/api/runtime-controls?include_native=false"
        before = page.request.get(runtime).json()
        zh = language == "zh"
        check_enrichment(page, base, settings, zh, evidence)
        check_candidates(page, base, settings, width, height, zh, evidence)
        check_library(page, base, settings, zh, evidence)
        check_evidence_tables(page, base, settings, zh, evidence)
        assert not writes
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()
