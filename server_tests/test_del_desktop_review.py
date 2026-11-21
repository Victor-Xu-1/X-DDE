"""Exercise the retained DEL results on short desktops."""

import json
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_candidate_inspection_desktop import dataset_candidate, load_case


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
        drawing = card.locator(".molecule-image img")
        expect(drawing).to_be_in_viewport(ratio=0.94, timeout=30_000)
        drawing_box = drawing.bounding_box()
        card_box = card.bounding_box()
        assert drawing_box["y"] + drawing_box["height"] <= card_box["y"] + card_box["height"]
    page.screenshot(path=evidence / "library-definition.png")

    panel, _, _ = open_example(page, base, settings, "del.enumerate", zh)
    check_library_members(page, panel, zh, evidence)


def check_library_members(page, panel, zh, evidence):
    inspection = panel.locator(".dataset-member-inspector")
    member = panel.locator(".dataset-library-table tbody tr").nth(1).locator(".dataset-row-title")
    expect(member).to_be_visible(timeout=30_000)
    selected = member.inner_text().strip()
    member.click()
    expect(inspection.get_by_role("heading")).to_have_text(selected)
    expect(inspection.locator(".molecule-inspection-view img")).to_be_in_viewport(
        ratio=0.95, timeout=30_000,
    )
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
                "生物学重复性需单独验证"
                if zh
                else "biological reproducibility require separate evidence"
            )


@contextmanager
def del_browser(settings, evidence, language, theme, width, height):
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
        yield page, base
        assert not writes
        assert page.request.get(runtime).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1180, 720),
    ("zh", "dark", 1440, 800),
])
def test_del_desktop_review(language, theme, width, height):
    settings = Settings.from_env()
    evidence = Path("outputs/del-desktop-review") / f"{language}-{width}"
    with del_browser(settings, evidence, language, theme, width, height) as (page, base):
        zh = language == "zh"
        check_enrichment(page, base, settings, zh, evidence)
        check_candidates(page, base, settings, width, height, zh, evidence)
        check_library(page, base, settings, zh, evidence)
        check_evidence_tables(page, base, settings, zh, evidence)


def check_candidate_tools(page, workspace, frame, zh):
    actions = workspace.locator(".viewer-heading-actions")
    tools = actions.locator(".viewer-tool-trigger")
    expect(tools).to_be_in_viewport(ratio=1)
    tools.press("Enter")
    expect(tools).to_have_attribute("aria-expanded", "true")
    expect(actions.locator(".viewer-tool-content")).to_be_in_viewport()
    tools.press("Escape")
    expect(tools).to_have_attribute("aria-expanded", "false")
    expect(tools).to_be_focused()

    surface = workspace.get_by_role("button", name="分子表面" if zh else "Surface", exact=True)
    surface.click()
    expect(surface).to_have_attribute("aria-pressed", "true")
    sticks = workspace.get_by_role("button", name="棒状结构" if zh else "Sticks", exact=True)
    sticks.click()
    expect(sticks).to_have_attribute("aria-pressed", "true")

    expanded = actions.locator("[data-workspace-expand]")
    handle = frame.element_handle()
    assert handle
    expanded.press("Enter")
    expect(workspace).to_have_attribute("data-workspace-expanded", "true")
    page.keyboard.press("Escape")
    expect(workspace).not_to_have_attribute("data-workspace-expanded", "true")
    assert frame.evaluate("(current, original) => current === original", handle)
    expect(expanded).to_be_focused()


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1080, 650),
    ("en", "warm", 1120, 650),
    ("zh", "dark", 1280, 700),
    ("en", "light", 1440, 900),
])
def test_del_retained_result_layout(language, theme, width, height):
    settings = Settings.from_env()
    evidence = Path("outputs/del-desktop-review") / f"retained-{language}-{width}"
    zh = language == "zh"
    with del_browser(settings, evidence, language, theme, width, height) as (page, base):
        _, output, result = load_case(page, base, "del.candidates", settings)
        panel = page.locator(".dataset-results")
        workspace = panel.locator(".structure-workbench:has([data-del-review])")
        frame = workspace.locator(".molecular-stage iframe")
        figure = workspace.locator(".viewer-panel .figure-export-trigger")
        expect(figure).to_be_enabled(timeout=45_000)
        expect(frame).to_be_in_viewport(ratio=0.99)
        box = frame.bounding_box()
        right = workspace.locator(":scope > .structure-workbench-details")
        rail = right.bounding_box()
        assert box and rail and box["height"] >= 320
        assert box["x"] + box["width"] < rail["x"]
        expect(right.locator("tbody tr").first).to_be_in_viewport(ratio=0.99)
        expect(right.locator(".molecule-image")).to_have_count(0)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=evidence / "candidate.png")
        check_candidate_tools(page, workspace, frame, zh)
        dataset_candidate(page, workspace, frame, figure, output, result, "del.candidates", zh)

        load_case(page, base, "del.enumerate", settings)
        expect(panel.locator(".dataset-library-table .molecule-image")).to_have_count(0)
        source = panel.get_by_role("link", name="下载 MOL" if zh else "Download MOL", exact=True)
        expect(source).to_be_visible()
        href = source.get_attribute("href")
        assert href and "report_sha256=" in href
        content = page.request.get(base + href)
        assert content.ok
        with page.expect_download() as original:
            source.click()
        assert original.value.path().read_bytes() == content.body()
        check_library_members(page, panel, zh, evidence)


def check_short_drawing(active, workspace, zh):
    sheet = active.locator(".figure-preview-sheet")
    image = sheet.locator("img")
    expect(image).to_be_visible(timeout=30_000)
    expect(sheet).to_be_in_viewport(ratio=0.99)
    expect(active.locator(".figure-export-trigger")).to_be_in_viewport(ratio=0.98)
    bounds = sheet.bounding_box()
    rail = workspace.locator(":scope > .structure-workbench-details").bounding_box()
    assert bounds and rail and bounds["height"] >= 245, bounds
    assert bounds["x"] + bounds["width"] < rail["x"]
    first = workspace.locator(".structure-workbench-details tbody tr").first
    expect(first.locator("td").first).to_be_in_viewport(ratio=0.99)
    heavy = "二维图线条粗细" if zh else "2D drawing line weight"
    expect(active.get_by_role("combobox", name=heavy)).to_be_in_viewport(ratio=0.99)
    zoom = active.get_by_role("button", name="放大预览" if zh else "Zoom in preview")
    zoom.click()
    expect(sheet).to_have_attribute("data-zoom", "2")
    active.get_by_role("button", name="适应窗口" if zh else "Fit preview").click()
    expect(sheet).to_have_attribute("data-zoom", "1")


@pytest.mark.parametrize(("language", "theme"), [("en", "warm"), ("zh", "dark")])
def test_del_first_screen_at_1024_by_600(language, theme):
    settings = Settings.from_env()
    zh = language == "zh"
    evidence = Path("outputs/del-desktop-review") / f"short-{language}-1024"
    with del_browser(settings, evidence, language, theme, 1024, 600) as (page, base):
        load_case(page, base, "del.enumerate", settings)
        panel = page.locator(".dataset-results")
        workspace = panel.locator(".structure-workbench:visible")
        active = workspace.locator(".dataset-member-inspector")
        check_short_drawing(active, workspace, zh)
        count_group = workspace.locator(".dataset-result-counts")
        count_group.locator("summary").press("Space")
        expect(count_group).to_have_attribute("open", "")
        expect(count_group.locator(".dataset-count-values")).to_contain_text(
            "解析结构" if zh else "Resolved structures",
        )
        count_group.locator("summary").press("Space")
        expect(count_group).not_to_have_attribute("open", "")
        page.screenshot(path=evidence / "library-first-screen.png")

        panel.get_by_role("tab", name="候选结构" if zh else "Candidate structures").click()
        active = workspace.locator(".candidate-inspection-preview")
        check_short_drawing(active, workspace, zh)
        page.screenshot(path=evidence / "candidate-drawing-first-screen.png")

        load_case(page, base, "del.candidates", settings)
        scene = workspace.locator(".molecular-stage iframe")
        expect(scene).to_be_in_viewport(ratio=0.99, timeout=45_000)
        box = scene.bounding_box()
        rail = workspace.locator(":scope > .structure-workbench-details").bounding_box()
        assert box and rail and box["height"] >= 290
        assert box["x"] + box["width"] < rail["x"]
        expect(workspace.locator(".research-table td").first).to_be_in_viewport()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=evidence / "candidate-3d-first-screen.png")
