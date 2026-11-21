"""Chrome: compact utility materials, native review, and retained navigation."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/utility-navigation")
DRAFT = "CC(=O)Nc1ccc(O)cc1"


@pytest.mark.parametrize(("language", "height"), [("en", 600), ("zh", 580)])
def test_short_desktop_recognition_tools_remain_visible_together(language, height):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with (
        platform(Settings.from_env().state_dir, EVIDENCE / "recognition-desktop.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1001, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        page.route(
            "**/api/utilities/recognition",
            lambda route: route.fulfill(json={"available": True}),
        )
        page.route("http://127.0.0.1:8940/**", lambda route: route.fulfill(
            content_type="text/html", body="""<!doctype html><script>
            window.addEventListener("message", ({data, origin, source}) => {
              if (data.type === "xdde-drawing:connect") {
                source.postMessage({
                  type: "xdde-drawing:state", id: data.id, available: false,
                }, origin);
              }
            });
            </script>""",
        ))
        page.goto(f"{base}/#view=utilities")
        frame = page.locator(".utility-recognition-frame")
        expect(frame).to_be_visible()
        expect(page.locator(".utility-drawing-destination")).to_be_disabled()
        strip = page.locator(".utility-tabs")
        expect(strip.get_by_role("button")).to_have_count(6)
        assert strip.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        assert frame.bounding_box()["height"] >= 440
        browser.close()


def wait_for_tab_in_view(page, selector):
    page.wait_for_function("""selector => {
      const strip = document.querySelector(".utility-tabs");
      const tab = strip.querySelector(selector);
      if (!tab) return false;
      const viewport = strip.getBoundingClientRect();
      const bounds = tab.getBoundingClientRect();
      return bounds.left >= Math.max(0, viewport.left) - 1 &&
        bounds.right <= Math.min(innerWidth, viewport.right) + 1;
    }""", arg=selector)


def expect_tab_in_view(page, strip, label):
    selected = strip.get_by_role("button", name=label, exact=True)
    expect(selected).to_have_attribute("aria-pressed", "true")
    wait_for_tab_in_view(page, 'button[aria-pressed="true"]')
    return selected


@pytest.mark.parametrize(("language", "width"), [("en", 390), ("zh", 320)])
def test_resize_keeps_current_tool_visible_and_draft_focused(tmp_path, language, width):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    chinese = language == "zh"
    states = "质子化与互变异构" if chinese else "Protonation & tautomers"
    properties = "分子性质" if chinese else "Molecular properties"
    admet = "ADMET 预测" if chinese else "ADMET prediction"
    source = (
        "粘贴分子结构文字（SMILES）" if chinese else "Paste molecular structure text (SMILES)"
    )
    with platform(tmp_path / "state", EVIDENCE / f"server-{language}.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1440, "height": 850})
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', '{language}')"
            )
            posts = []
            page.on(
                "request",
                lambda req: posts.append(req.url)
                if req.method == "POST" and req.url.startswith(f"{base}/api/")
                else None,
            )
            page.goto(f"{base}/#view=utilities")
            strip = page.locator(".utility-tabs")
            state_tab = strip.get_by_role("button", name=states, exact=True)
            state_tab.click()
            page.set_viewport_size({"width": width, "height": 850})
            expect(expect_tab_in_view(page, strip, states)).to_be_focused()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")

            page.set_viewport_size({"width": 1440, "height": 850})
            browsing = strip.get_by_role("button", name=admet, exact=True)
            browsing.focus()
            page.set_viewport_size({"width": width, "height": 850})
            wait_for_tab_in_view(page, "button:focus")
            expect(browsing).to_be_focused()
            expect(state_tab).to_have_attribute("aria-pressed", "true")

            page.set_viewport_size({"width": 1440, "height": 850})
            strip.get_by_role("button", name=properties, exact=True).click()
            form = page.locator('[data-utility="properties"]')
            form.get_by_role("radio", name=source, exact=True).check()
            draft = form.get_by_role("textbox", name="SMILES", exact=True)
            draft.fill(DRAFT)
            draft.focus()
            page.set_viewport_size({"width": width, "height": 850})
            expect_tab_in_view(page, strip, properties)
            expect(draft).to_be_focused()
            expect(draft).to_have_value(DRAFT)
            page.screenshot(path=EVIDENCE / f"focused-draft-{language}-{width}.png")

            # A user can scroll back to browse another tool without switching the draft.
            strip.evaluate("""strip => new Promise(resolve => {
              strip.scrollLeft = 0;
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            })""")
            assert strip.evaluate("strip => strip.scrollLeft") == 0
            expect(draft).to_be_focused()
            strip.get_by_role("button", name=admet, exact=True).click()
            strip.get_by_role("button", name=properties, exact=True).click()
            expect_tab_in_view(page, strip, properties)
            expect(draft).to_have_value(DRAFT)
            assert not posts
            browser.close()


def work_area(panel):
    return panel.evaluate("""panel => {
      const rect = (el) => {
        const {left, right, top, bottom, width, height} = el.getBoundingClientRect();
        return {left, right, top, bottom, width, height};
      };
      const one = (selector) => rect(panel.querySelector(selector));
      const image = '.image-molecule-input > .image-molecule-actions';
      return {
        panel: rect(panel),
        input: one('.single-page-main'),
        preview: one('.single-page-preview'),
        upload: one(image + ' > button:first-of-type'),
        paste: one(image + ' > button:nth-of-type(2)'),
        run: one('.questionnaire-actions .primary-button'),
        backend: rect(document.querySelector('.utility-tabbar > .task-backend-control')),
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    }""")

@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1280, 720), ("zh", 1600, 775),
])
def test_desktop_tools_fit_one_strip_and_keep_a_large_preview(language, width, height):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    key = f"desktop-{language}-{width}"
    with platform(Settings.from_env().state_dir, EVIDENCE / f"{key}.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": width, "height": height})
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', '{language}')"
            )
            writes = []
            page.on(
                "request",
                lambda req: writes.append(req.url)
                if req.method != "GET" and req.url.startswith(f"{base}/api/")
                else None,
            )
            # Only the host allocation is under test here. The installed companion
            # itself is exercised in the owner browser with its engine switched off.
            page.route(
                "**/api/utilities/recognition",
                lambda route: route.fulfill(json={"available": True}),
            )
            page.route("http://127.0.0.1:8940/**", lambda route: route.fulfill(
                content_type="text/html", body="<main>Editor frame fixture</main>",
            ))
            page.goto(f"{base}/#view=utilities")
            strip = page.locator(".utility-tabs")
            tabs = strip.get_by_role("button")
            expect(tabs).to_have_count(6)
            frame = page.locator(".utility-recognition-frame")
            expect(frame).to_be_visible()
            assert frame.bounding_box()["height"] >= height * 0.80
            assert frame.evaluate("node => getComputedStyle(node).borderTopLeftRadius") == "10px"
            for index, tool in enumerate(("admet", "brain", "properties", "screen", "states"), 1):
                tabs.nth(index).click()
                expect(tabs.nth(index)).to_have_attribute("aria-pressed", "true")
                expect(page.locator(".utility-tabbar").get_by_role("switch")).not_to_be_checked()
                assert strip.evaluate("strip => strip.scrollWidth <= strip.clientWidth + 1")
                panel = page.locator(f'[data-utility="{tool}"]')
                expect(panel.locator(".single-page-main")).to_be_visible()
                expect(panel.locator(".example-toolbar")).to_be_visible()
                page.locator(".is-utilities > .studio-content").evaluate("node => node.scrollTop=0")
                area = work_area(panel)
                assert not area["overflow"], area
                assert area["input"]["top"] <= 220, area
                assert area["paste"]["bottom"] <= height, area
                assert area["run"]["bottom"] <= height, area
            properties = "分子性质" if zh else "Molecular properties"
            strip.get_by_role("button", name=properties, exact=True).click()
            form = page.locator('[data-utility="properties"]')
            source = (
                "粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)"
            )
            form.get_by_role("radio", name=source, exact=True).check()
            draft = form.get_by_role("textbox", name="SMILES", exact=True)
            draft.fill(DRAFT)
            drawing = form.locator('.molecule-image[data-drawing-state="ready"]')
            expect(drawing).to_be_visible(timeout=60000)
            area = work_area(form)
            assert drawing.bounding_box()["height"] >= height - 300
            assert area["preview"]["right"] < area["input"]["left"]
            assert area["run"]["bottom"] <= height, area
            expect(draft).to_be_focused()
            expect(draft).to_have_value(DRAFT)
            page.screenshot(path=EVIDENCE / f"{key}-preview.png")
            tabs.nth(1).click()
            strip.get_by_role("button", name=properties, exact=True).click()
            expect(draft).to_have_value(DRAFT)
            assert not writes
            browser.close()


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1110, 580), ("en", 320, 568), ("zh", 390, 775),
])
def test_empty_inputs_take_priority_and_selected_molecule_restores_preview(
    tmp_path, language, width, height,
):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    key = f"work-area-{language}-{width}"
    tools = ["admet", "brain", "properties", "screen", "states"]
    source = (
        "粘贴分子结构文字（SMILES）" if zh else "Paste molecular structure text (SMILES)"
    )
    with platform(tmp_path / "state", EVIDENCE / f"{key}.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome")
            page = browser.new_page(
                viewport={"width": width, "height": height}, reduced_motion="reduce"
            )
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', '{language}')"
            )
            writes = []
            page.on(
                "request",
                lambda req: writes.append(req.url)
                if req.method != "GET" and req.url.startswith(f"{base}/api/")
                else None,
            )
            page.goto(f"{base}/#view=utilities")
            tabs = page.locator(".utility-tabs button")
            for index, tool in enumerate(tools, start=1):
                tabs.nth(index).click()
                panel = page.locator(f'[data-utility="{tool}"]')
                expect(panel.locator(".utility-template-controls .example-toolbar")).to_be_visible()
                backend = page.locator(".utility-tabbar").get_by_role("switch")
                expect(backend).to_have_attribute("aria-checked", "false")
                page.locator('.studio-main.is-utilities > .studio-content').evaluate(
                    "content => { content.scrollTop = 0; }"
                )
                area = work_area(panel)
                assert not area["overflow"], area
                assert area["input"]["width"] >= 0.90 * area["panel"]["width"], area
                assert area["upload"]["bottom"] <= area["height"], area
                assert area["paste"]["bottom"] <= area["height"], area
                if width == 320:
                    assert abs(area["upload"]["top"] - area["paste"]["top"]) <= 1, area
                    assert area["input"]["top"] <= height - 96, area
                if width == 1110:
                    assert area["backend"]["height"] < 60, area
                    if tool == "properties":
                        assert area["run"]["bottom"] <= height, area

            tabs.nth(3).click()
            panel = page.locator('[data-utility="properties"]')
            if width <= 390:
                guide = panel.locator("summary[aria-label]").filter(
                    has=page.locator(".example-guide-caption")
                )
                guide.click()
                expect(panel.locator(".example-guide-content strong")).to_contain_text("STAT6")
                page.keyboard.press("Escape")
                expect(guide).to_be_focused()
            panel.get_by_role("radio", name=source, exact=True).check()
            draft = panel.get_by_role("textbox", name="SMILES", exact=True)
            draft.fill(DRAFT)
            expect(panel.locator(".molecular-input-review")).to_be_visible()
            filled = work_area(panel)
            if width >= 1100:
                assert filled["preview"]["right"] <= filled["input"]["left"], filled
                assert filled["preview"]["width"] > filled["input"]["width"], filled
            else:
                assert filled["input"]["bottom"] <= filled["preview"]["top"], filled
            expect(draft).to_have_value(DRAFT)
            page.screenshot(path=EVIDENCE / f"{key}-selected.png")
            draft.fill("")
            expect(panel.locator(".single-page-preview")).to_be_hidden()
            assert not writes
            browser.close()
