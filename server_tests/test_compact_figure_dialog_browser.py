"""The narrow figure dialog keeps native preview and download controls reachable."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("outputs/publication-browser/compact-dialog")


def trigger_for(page, base, language, format):
    zh = language == "zh"
    name = "文献图导出 ↓" if zh else "Export figure ↓"
    if format == "SVG":
        case = page.request.get(base + "/api/examples/caver.paths").json()
        page.goto(base + "/#task=" + case["pin"]["job_id"])
        chart = page.locator(".channel-profile")
        expect(chart.locator("svg")).to_be_visible(timeout=45000)
        return chart.get_by_role("button", name=name, exact=True)
    open_navigation(page, language).get_by_role(
        "button", name="高通量筛选" if zh else "High-throughput screening", exact=True
    ).click()
    page.locator(".module-task-picker select:visible").select_option("drugclip.screen")
    page.get_by_role(
        "button", name="示例结果" if zh else "Example results", exact=True
    ).click()
    return page.locator(".dataset-preview-pane .viewer-panel").get_by_role(
        "button", name=name, exact=True
    )


def geometry(dialog):
    return dialog.evaluate(
        """dialog => {
          const rect = element => {
            const {left, right, top, bottom, width, height} = element.getBoundingClientRect();
            return {left, right, top, bottom, width, height};
          };
          const body = dialog.querySelector('.figure-export-layout');
          const preview = body.querySelector('.figure-preview-sheet');
          const action = dialog.querySelector('footer button');
          const out = action.getBoundingClientRect();
          const hit = document.elementFromPoint(out.x + out.width / 2, out.y + out.height / 2);
          return {
            frame: rect(dialog), body: rect(body), preview: rect(preview), action: rect(action),
            header: rect(dialog.querySelector(':scope > header')),
            actionReachable: hit === action || action.contains(hit),
            documentWidth: document.documentElement.clientWidth,
            viewportHeight: innerHeight,
            horizontalBody: body.scrollWidth > body.clientWidth,
            scrollWindow: dialog.scrollTop,
            canScroll: body.scrollHeight > body.clientHeight,
            labels: [...body.querySelectorAll('fieldset label')].map(rect),
          };
        }"""
    )


def assert_first_screen(layout):
    frame, preview, action = (layout[key] for key in ("frame", "preview", "action"))
    assert 0 <= frame["left"] < frame["right"] <= layout["documentWidth"] + 1
    assert 0 <= frame["top"] < action["top"] < action["bottom"] <= layout["viewportHeight"]
    assert action["bottom"] <= frame["bottom"] and action["height"] >= 44
    assert action["width"] >= frame["width"] - 35
    assert layout["actionReachable"] and not layout["horizontalBody"]
    assert preview["top"] < layout["body"]["bottom"]
    assert layout["scrollWindow"] == 0
    assert layout["labels"][0]["top"] == layout["labels"][1]["top"]


def check_short_body_scroll(page, dialog, before):
    assert before["canScroll"]
    body, preview = before["body"], before["preview"]
    page.mouse.move(
        preview["left"] + preview["width"] / 2,
        (preview["top"] + min(preview["bottom"], body["bottom"])) / 2,
    )
    page.mouse.wheel(0, 390)
    page.wait_for_function(
        "() => document.querySelector('dialog[open] .figure-export-layout').scrollTop > 0"
    )
    after = geometry(dialog)
    assert after["action"] == before["action"] and after["header"] == before["header"]
    assert after["actionReachable"] and after["scrollWindow"] == 0
    dialog.locator(".figure-export-layout").evaluate("el => { el.scrollTop = 0; }")


@pytest.mark.parametrize(
    ("language", "format", "width", "height"),
    [("zh", "PNG", 390, 775), ("en", "PNG", 320, 568), ("en", "SVG", 390, 775)],
)
def test_native_figure_action_stays_visible_on_narrow_screens(language, format, width, height):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    key = f"{language}-{format.lower()}-{width}"
    zh = language == "zh"
    settings = Settings.from_env()
    with platform(settings.state_dir, EVIDENCE / (key + ".log")) as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": width, "height": height}, reduced_motion="reduce"
        )
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        launcher = trigger_for(page, base, language, format)
        expect(launcher).to_be_enabled(timeout=45000)
        launcher.press("Enter")
        dialog = page.get_by_role("dialog")
        close = dialog.get_by_role("button", name="关闭" if zh else "Close", exact=True)
        expect(close).to_be_focused()
        page.keyboard.press("Tab")
        expect(dialog.get_by_role("combobox").first).to_be_focused()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(launcher).to_be_focused()

        def choose_settings(dialog):
            if format == "PNG":
                dialog.get_by_role(
                    "combobox", name="清晰度" if zh else "Resolution", exact=True
                ).select_option("300")

        def inspect(dialog):
            layout = geometry(dialog)
            assert_first_screen(layout)
            if width == 320:
                check_short_body_scroll(page, dialog, layout)
            else:
                assert layout["preview"]["bottom"] <= layout["body"]["bottom"] + 1
            if format == "SVG":
                page.set_viewport_size({"width": 1440, "height": 900})
                desktop = geometry(dialog)
                assert desktop["preview"]["left"] > desktop["labels"][0]["right"]
                assert desktop["actionReachable"]
                page.set_viewport_size({"width": width, "height": height})
                assert_first_screen(geometry(dialog))
            (EVIDENCE / (key + "-layout.json")).write_text(
                json.dumps(layout, indent=2), encoding="utf-8"
            )

        figure = export_figure(
            page, launcher, EVIDENCE, key, language, format,
            configure=choose_settings, inspect=inspect,
        )
        expect(launcher).to_be_focused()
        if format == "PNG":
            inspect_png(figure, dpi=300, width=1051)
        else:
            inspect_svg(figure, "Å")
        assert page.request.get(base + "/api/jobs").json() == jobs
        browser.close()
