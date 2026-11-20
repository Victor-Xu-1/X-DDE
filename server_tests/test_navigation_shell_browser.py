"""Shared navigation, task context and search over the actual restored platform."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/navigation-shell")
DESTINATIONS = [
    ("靶点研究", "Target research"),
    ("结构预测", "Structure prediction"),
    ("口袋与对接", "Pockets and docking"),
    ("小分子设计", "Small-molecule design"),
    ("诱导邻近设计", "Induced proximity"),
    ("高通量筛选", "High-throughput screening"),
    ("DEL 研究", "DEL research"),
    ("生物药研究", "Biologics research"),
    ("性质与安全性", "Properties and safety"),
    ("研究空间", "Research workspace"),
    ("动力学与 FEP", "Dynamics and FEP"),
    ("全部能力", "All capabilities"),
]


@pytest.fixture
def shell_page():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(os.environ["WB_BROWSER_URL"])
        settings(page, "en")
        page.locator("#settings-language").select_option("zh")
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        yield page
        assert not errors, errors
        assert not submissions, "Navigation submitted research or installation"
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()


def open_navigation(page, language):
    if page.viewport_size["width"] <= 960:
        page.get_by_role(
            "button",
            name="打开研究导航" if language == "zh" else "Open research navigation",
            exact=True,
        ).click()
        expect(
            page.get_by_role(
                "dialog", name="研究导航" if language == "zh" else "Research navigation", exact=True
            )
        ).to_be_visible()
    return page.get_by_role(
        "navigation", name="主导航" if language == "zh" else "Main navigation", exact=True
    )


def settings(page, language):
    open_navigation(page, language)
    page.get_by_role(
        "button", name="设置与帮助" if language == "zh" else "Settings and help", exact=True
    ).click()
    page.get_by_role(
        "menuitem", name="界面设置" if language == "zh" else "Appearance and language", exact=True
    ).click()
    expect(page.locator("#settings-language")).to_be_visible()


def capture(page, name):
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    page.screenshot(path=EVIDENCE / (name + ".png"))


def desktop_header_geometry(header):
    return header.evaluate("""bar => {
        const selectors = [
            '.page-context', '.module-workspace-navigation', '.task-search', '.top-actions',
        ];
        const parts = selectors.map(selector => bar.querySelector(selector))
            .filter(Boolean).map(node => node.getBoundingClientRect())
            .filter(rect => rect.width > 0 && rect.height > 0);
        const bounds = bar.getBoundingClientRect();
        const field = bar.querySelector('.global-search').getBoundingClientRect();
        const trigger = bar.querySelector('.compact-search-trigger').getBoundingClientRect();
        const title = bar.querySelector('.page-context-title');
        const titleBounds = title.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(title);
        return {
            separated: parts.every((rect, index) => !index || rect.left >= parts[index-1].right),
            inside: parts.every(rect => rect.left >= bounds.left && rect.right <= bounds.right),
            titleFits: Array.from(text.getClientRects()).every(rect =>
                rect.left >= titleBounds.left - 1 && rect.right <= titleBounds.right + 1),
            headerHeight: bounds.height,
            searchWidth: field.width || trigger.width,
            compactSearch: trigger.width > 0,
        };
    }""")


def record_desktop_header(page, header, measurements, state):
    width = page.viewport_size["width"]
    title = header.locator(".page-context-title").inner_text()
    geometry = desktop_header_geometry(header)
    assert geometry["separated"] and geometry["inside"], (width, title, state, geometry)
    min_search_width = 36 if geometry["compactSearch"] else 149
    assert geometry["titleFits"] and geometry["searchWidth"] >= min_search_width, (
        width, title, state, geometry,
    )
    assert geometry["headerHeight"] <= 90, (width, title, state, geometry)
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    measurements.append({"width": width, "title": title, "state": state, **geometry})


def verify_retained_desktop_headers(page, base, header, field, language, measurements):
    search = header.get_by_role(
        "button", name="搜索任务" if language == "zh" else "Search tasks", exact=True
    )

    def inspect(state, selector):
        expect(page.locator(selector)).to_be_visible(timeout=45000)
        for width in (961, 1280):
            page.set_viewport_size({"width": width, "height": 800})
            record_desktop_header(page, header, measurements, state)
            expect(header.locator(".module-workspace-navigation button:visible")).to_have_count(2)
            compact = search.is_visible()
            if compact:
                search.click()
            else:
                field.click()
            expect(field).to_be_focused()
            field.press("Escape")
            expect(search if compact else field).to_be_focused()

    for operation, selector in (
        ("predict", ".prediction-result"),
        ("biopython.ensemble", ".receptor-results"),
        ("p2rank.detect", ".pocket-result-workspace"),
        ("chemistry.states", ".state-native-preview"),
    ):
        response = page.request.get(f"{base}/api/examples/{operation}")
        assert response.ok, operation
        job = response.json()["pin"]["job_id"]
        page.goto(base + "/#task=" + job)
        inspect(operation, selector)
        if operation == "biopython.ensemble":
            page.set_viewport_size({"width": 1180, "height": 720})
            root = page.locator(selector)
            expect(root.locator(".figure-export-trigger")).to_be_enabled(timeout=35000)
            frame = root.locator(".molecular-stage iframe")
            bounds = frame.bounding_box()
            assert bounds and bounds["height"] >= 440 and bounds["y"] + bounds["height"] <= 722
            expect(root.locator(".receptor-member-table tbody tr").first).to_be_in_viewport()

    page.goto(base + "/#view=new&tool=workflows")
    example = "示例结果" if language == "zh" else "Example results"
    page.get_by_role("button", name=example, exact=True).click()
    inspect("archived workflow", ".module-template.is-preview .docking-results")


@pytest.mark.parametrize("language", ["zh", "en"])
def test_desktop_header_keeps_search_and_actions_separate(shell_page, language):
    page = shell_page
    base = os.environ["WB_BROWSER_URL"]
    if language == "en":
        page.locator("#settings-language").select_option("en")
    nav = open_navigation(page, language)
    header = page.locator(".studio-topbar")
    field = header.get_by_role(
        "searchbox", name="搜索任务" if language == "zh" else "Search tasks", exact=True
    )
    search = header.get_by_role(
        "button", name="搜索任务" if language == "zh" else "Search tasks", exact=True
    )
    backend = header.get_by_role(
        "button", name="后端管理" if language == "zh" else "Backend controls", exact=True
    )
    history = json.loads((EVIDENCE / "searchable-native-history.json").read_text())
    runtime = page.request.get(base + "/api/runtime-controls").json()
    mutations = []
    page.on("request", lambda request: mutations.append(request.url)
            if request.method not in {"GET", "HEAD", "OPTIONS"} else None)
    measurements = []
    for width in (961, 1100, 1101, 1280, 1600):
        page.set_viewport_size({"width": width, "height": 800})
        for labels in [("小工具", "Utilities"), *DESTINATIONS]:
            title = labels[0 if language == "zh" else 1]
            nav.get_by_role("button", name=title, exact=True).click()
            expect(header.locator(".page-context-title")).to_have_text(title)
            record_desktop_header(page, header, measurements, "module")
    verify_retained_desktop_headers(page, base, header, field, language, measurements)

    page.set_viewport_size({"width": 961, "height": 800})
    nav.get_by_role("button", name="高通量筛选" if language == "zh"
                    else "High-throughput screening", exact=True).click()
    backend.click()
    panel = header.get_by_role(
        "region", name="本模块的后端" if language == "zh"
        else "Backends in this module", exact=True
    )
    expect(panel).to_be_visible()
    backend.press("Escape")
    expect(backend).to_be_focused()
    expect(panel).to_have_count(0)

    if search.is_visible():
        search.click()
    field.click()
    expect(header.locator(".global-search")).not_to_have_css("box-shadow", "none")
    field.fill(history["job_id"])
    matches = header.get_by_role(
        "region", name="任务搜索结果" if language == "zh" else "Task search results", exact=True
    )
    expect(matches.get_by_role("button")).to_have_count(1)
    bounds = matches.bounding_box()
    assert bounds and 0 <= bounds["x"] and bounds["x"] + bounds["width"] <= 961
    capture(page, f"desktop-search-{language}-961")
    page.set_viewport_size({"width": 1280, "height": 800})
    expect(field).to_have_value(history["job_id"])
    expect(field).to_be_focused()
    field.press("ArrowDown")
    expect(matches.get_by_role("button")).to_be_focused()
    page.keyboard.press("Enter")
    expect(page).to_have_url(base + "/#view=results&module=biologics&task=" + history["job_id"])
    expect(page.locator(".sequence-score-results")).to_be_visible(timeout=30000)
    assert desktop_header_geometry(header)["separated"]
    assert page.request.get(base + "/api/runtime-controls").json() == runtime
    assert not mutations
    (EVIDENCE / f"desktop-header-{language}.json").write_text(
        json.dumps(measurements, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def test_compact_header_keeps_actions_and_task_navigation_reachable(shell_page):
    page = shell_page
    base = os.environ["WB_BROWSER_URL"]
    header = page.locator(".studio-topbar")
    search = header.get_by_role("button", name="搜索任务", exact=True)
    backend = header.get_by_role("button", name="后端管理", exact=True)
    notifications = header.locator('summary[aria-label="任务提醒"]')
    workspace = header.get_by_role("navigation", name="模块工作区")
    new_task = workspace.get_by_role("button", name="新建任务", exact=True)
    results = workspace.get_by_role("button", name="任务结果", exact=True)
    initial = page.request.get(base + "/api/runtime-controls").json()
    mutations = []
    page.on("request", lambda event: mutations.append(event.url)
            if event.method in {"POST", "PUT", "PATCH", "DELETE"} else None)

    for width in (320, 390, 600):
        page.set_viewport_size({"width": width, "height": 775})
        page.goto(base + "/#view=new&tool=discovery.import")
        expect(header.locator(".page-context-title")).to_have_text("靶点研究")
        expect(new_task).to_have_attribute("aria-pressed", "true")
        row = [control.bounding_box() for control in (search, backend, notifications)]
        assert all(box["width"] >= 44 and box["height"] >= 44 for box in row)
        assert max(box["y"] for box in row) - min(box["y"] for box in row) < 1
        assert max(box["x"] + box["width"] for box in row) <= width
        assert new_task.bounding_box()["y"] >= row[0]["y"] + row[0]["height"]
        assert header.bounding_box()["height"] <= 120
        assert header.evaluate("""bar => {
            const items = [...bar.children];
            return items.findIndex(e => e.matches('.task-search'))
                < items.findIndex(e => e.matches('.module-workspace-navigation'));
        }""")

        search.focus()
        page.keyboard.press("Tab")
        expect(backend).to_be_focused()
        page.keyboard.press("Tab")
        expect(notifications).to_be_focused()
        page.keyboard.press("Tab")
        expect(new_task).to_be_focused()

        backend.click()
        panel = header.get_by_role("region", name="本模块的后端", exact=True)
        expect(panel).to_be_visible()
        discovery = panel.locator('[data-engine="discovery"]').get_by_role("switch")
        expect(discovery).not_to_be_checked()
        bounds = panel.bounding_box()
        assert 0 <= bounds["x"] and bounds["x"] + bounds["width"] <= width
        backend.press("Escape")
        expect(backend).to_be_focused()
        expect(panel).to_have_count(0)

        notifications.click()
        expect(header.get_by_text("需关注的任务", exact=True)).to_be_visible()
        search.click()
        expect(header.locator(".top-popover[open]")).to_have_count(0)
        field = header.get_by_role("searchbox", name="搜索任务", exact=True)
        expect(field).to_be_focused()
        field.fill("no-existing-research-task")
        expect(header.get_by_text("没有匹配的任务", exact=True)).to_be_visible()
        search_results = header.get_by_role("region", name="任务搜索结果").bounding_box()
        assert 0 <= search_results["x"] and search_results["x"] + search_results["width"] <= width
        field.press("Escape")
        expect(search).to_be_focused()
        results.click()
        expect(results).to_have_attribute("aria-pressed", "true")
        new_task.click()
        expect(new_task).to_have_attribute("aria-pressed", "true")
        capture(page, f"compact-module-header-{width}")

    search.click()
    field = header.get_by_role("searchbox", name="搜索任务", exact=True)
    field.fill("keep search while resizing")
    page.set_viewport_size({"width": 601, "height": 775})
    expect(field).to_have_value("keep search while resizing")
    expect(field).to_be_focused()
    field.press("Escape")
    expect(search).to_be_focused()
    page.set_viewport_size({"width": 1440, "height": 900})
    expect(header.locator(".backend-controls-label")).to_be_visible()
    expect(header.get_by_role("searchbox", name="搜索任务", exact=True)).to_be_visible()
    expect(search).not_to_be_visible()
    assert header.evaluate("""bar => {
        const items = [...bar.children];
        return items.findIndex(e => e.matches('.module-workspace-navigation'))
            < items.findIndex(e => e.matches('.task-search'));
    }""")
    assert not mutations
    assert page.request.get(base + "/api/runtime-controls").json() == initial


def test_every_research_destination_has_full_navigation_and_visible_context(shell_page):
    page = shell_page
    measurements = []
    for language in ("zh", "en"):
        if language == "en":
            settings(page, "zh")
            page.locator("#settings-language").select_option("en")
        for width in (1440, 768, 390, 320):
            page.set_viewport_size({"width": width, "height": 1000})
            for index, labels in enumerate(DESTINATIONS):
                label = labels[0 if language == "zh" else 1]
                nav = open_navigation(page, language)
                button = nav.get_by_role("button", name=label, exact=True)
                expect(button.locator("span:not(.anticon)").first).to_be_visible()
                if width <= 960:
                    dialog = page.get_by_role(
                        "dialog",
                        name="研究导航" if language == "zh" else "Research navigation",
                        exact=True,
                    )
                    assert dialog.bounding_box()["width"] <= width - 30
                    button.scroll_into_view_if_needed()
                    if index == 5:
                        capture(page, f"navigation-{language}-{width}")
                button.click()
                expect(page.locator(".page-context-title")).to_have_text(label)
                expect(page.locator(".page-context-title")).to_be_visible()
                if width <= 960:
                    expect(page.get_by_role("dialog")).to_have_count(0)
                if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                    stem = f"overflow-{language}-{width}-{index}"
                    page.screenshot(path=EVIDENCE / (stem + ".png"))
                    layout = page.evaluate("""() => [...document.querySelectorAll('body *')]
                        .map(e=>({tag:e.tagName,cls:String(e.className),
                            x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,
                            width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))
                        .filter(e=>e.width>0 && e.height>0 && e.right>innerWidth+1).slice(0,40)
                    """)
                    (EVIDENCE / (stem + ".json")).write_text(json.dumps(layout, indent=2))
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                if index in (0, 1, 5, 7, 11):
                    capture(page, f"{language}-{width}-destination-{index}")
                measurements.append(
                    {
                        "language": language,
                        "width": width,
                        "destination": label,
                        "visible_context": True,
                    }
                )
        settings(page, language)
        page.get_by_role(
            "radio", name="夜间黑色" if language == "zh" else "Night black", exact=True
        ).check()
        page.set_viewport_size({"width": 390, "height": 1000})
        open_navigation(page, language)
        capture(page, f"navigation-{language}-dark-390")
        page.keyboard.press("Escape")
        expect(
            page.get_by_role(
                "button",
                name="打开研究导航" if language == "zh" else "Open research navigation",
                exact=True,
            )
        ).to_be_focused()
        page.get_by_role("radio", name="暖色" if language == "zh" else "Warm", exact=True).check()
    (EVIDENCE / "destinations.json").write_text(
        json.dumps(measurements, ensure_ascii=False, indent=2)
    )


def test_navigation_and_search_preserve_inputs_and_select_exact_existing_tasks(shell_page):
    page = shell_page
    page.set_viewport_size({"width": 390, "height": 1000})
    nav = open_navigation(page, "zh")
    nav.get_by_role("button", name="结构预测", exact=True).click()
    page.get_by_role("radio", name="蛋白结构", exact=True).check()
    page.get_by_role("button", name="下一步", exact=True).click()
    sequence = page.locator(".questionnaire:visible textarea")
    expect(sequence).to_have_count(1)
    value = (
        "SMNPPPPETSNPNKPKRQTNQLQYLLRVVLKTLWKHQFAWPFQQPVDAVKLNLPDYYKIIKTPMDMGTIKKRLENNYYWNAQECIQDFNT"
    )
    sequence.fill(value)
    opener = page.get_by_role("button", name="打开研究导航", exact=True)
    opener.click()
    for _ in range(16):
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('dialog') != null")
    page.keyboard.press("Escape")
    expect(opener).to_be_focused()
    expect(sequence).to_have_value(value)
    opener.click()
    page.mouse.click(370, 300)
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(sequence).to_have_value(value)
    capture(page, "preserved-input-390")

    search_trigger = page.get_by_role("button", name="搜索任务", exact=True)
    search_trigger.click()
    search = page.get_by_role("searchbox", name="搜索任务", exact=True)
    expect(search).to_be_focused()
    search.fill("no-existing-research-task")
    expect(page.get_by_role("status").filter(has_text="没有匹配的任务")).to_be_visible()
    capture(page, "search-empty-390")
    page.keyboard.press("Escape")
    expect(search_trigger).to_be_focused()
    expect(sequence).to_have_value(value)

    base = os.environ["WB_BROWSER_URL"]
    # Public module examples deliberately stay out of personal task search.
    # Use the isolated, source-verified historical task restored before startup.
    job_id = json.loads((EVIDENCE / "searchable-native-history.json").read_text())["job_id"]
    search_trigger.click()
    search.fill(job_id)
    result = page.get_by_role("region", name="任务搜索结果", exact=True)
    expect(result.get_by_role("button")).to_have_count(1)
    page.keyboard.press("ArrowDown")
    expect(result.get_by_role("button")).to_be_focused()
    capture(page, "search-real-result-390")
    page.keyboard.press("Enter")
    expect(page).to_have_url(base + "/#view=results&module=biologics&task=" + job_id)
    expect(page.locator(".page-context-title")).to_have_text("生物药研究")
    expect(page.locator(".sequence-score-results")).to_be_visible(timeout=30000)
    capture(page, "selected-existing-task-390")

    page.set_viewport_size({"width": 1440, "height": 1000})
    expect(search).to_be_visible()
    search.fill("no-existing-research-task")
    page.keyboard.press("Escape")
    expect(search).to_be_focused()
    expect(search).to_have_value("")
