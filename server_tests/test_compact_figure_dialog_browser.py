"""The native figure stays in view alongside reachable close and download controls."""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("outputs/publication-browser/compact-dialog")


def trigger_for(page, base, language, format, example):
    zh = language == "zh"
    name = "文献图导出 ↓" if zh else "Export figure ↓"
    if example:
        case = page.request.get(base + "/api/examples/" + example).json()
        page.goto(base + "/#task=" + case["pin"]["job_id"])
        selector = {
            "library.import": ".dataset-member-inspector .molecule-image",
            "drugclip.index": ".dataset-member-inspector .viewer-panel",
            "screening.dock": ".candidate-inspection-preview .viewer-panel",
            "admet.predict": ".admet-molecule-drawing .molecule-image",
        }[example]
        return page.locator(selector).get_by_role("button", name=name, exact=True)
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
          const preview = body.querySelector('.figure-export-canvas');
          const image = preview.querySelector('img');
          const imageScale = image ? Math.min(image.clientWidth / image.naturalWidth,
                                               image.clientHeight / image.naturalHeight) : 0;
          const options = body.querySelector('.figure-export-options');
          const action = dialog.querySelector('footer button');
          const out = action.getBoundingClientRect();
          const hit = document.elementFromPoint(out.x + out.width / 2, out.y + out.height / 2);
          return {
            frame: rect(dialog), body: rect(body), preview: rect(preview), action: rect(action),
            header: rect(dialog.querySelector(':scope > header')),
            actionReachable: hit === action || action.contains(hit),
            previewControls: rect(body.querySelector('.figure-view-toolbar')),
            fittedImage: imageScale && {width: image.naturalWidth * imageScale,
                                       height: image.naturalHeight * imageScale},
            options: rect(options),
            optionsFit: options.scrollHeight <= options.clientHeight + 1,
            spec: rect(options.querySelector('.figure-output-spec')),
            documentWidth: document.documentElement.clientWidth,
            viewportHeight: innerHeight,
            horizontalBody: body.scrollWidth > body.clientWidth,
            scrollWindow: dialog.scrollTop,
            canScroll: body.scrollHeight > body.clientHeight,
            labels: [...body.querySelectorAll('fieldset label')].map(rect),
          };
        }"""
    )


def assert_first_screen(layout, stacked):
    frame, preview, action = (layout[key] for key in ("frame", "preview", "action"))
    assert 0 <= frame["left"] < frame["right"] <= layout["documentWidth"] + 1
    assert 0 <= frame["top"] < action["top"] < action["bottom"] <= layout["viewportHeight"]
    assert action["bottom"] <= frame["bottom"] and action["height"] >= 44
    assert layout["actionReachable"] and not layout["horizontalBody"]
    body = layout["body"]
    assert body["top"] <= preview["top"] < preview["bottom"] <= body["bottom"] + 1
    assert layout["previewControls"]["bottom"] <= layout["body"]["bottom"] + 1
    assert layout["scrollWindow"] == 0
    if stacked:
        assert action["width"] >= frame["width"] - 35
        assert layout["options"]["top"] >= layout["previewControls"]["bottom"]
        assert layout["labels"][0]["top"] == layout["labels"][1]["top"]
    else:
        assert preview["right"] <= layout["options"]["left"]
        assert preview["width"] >= layout["options"]["width"] * 1.3


def assert_options_fit(dialog):
    clipped = dialog.locator("fieldset select").evaluate_all(
        """selects => {
          const context = document.createElement('canvas').getContext('2d');
          const losses = [];
          for (const select of selects) {
            const style = getComputedStyle(select);
            context.font = [style.fontWeight, style.fontSize, style.fontFamily].join(' ');
            const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
            const available = select.clientWidth - padding - 20;
            for (const option of select.options) {
              if (context.measureText(option.text).width > available)
                losses.push({label: option.text, available});
            }
          }
          return losses;
        }"""
    )
    assert not clipped, clipped


def check_short_body_scroll(page, dialog, before):
    assert before["canScroll"]
    preview_canvas = dialog.locator(".figure-export-canvas")
    dialog.get_by_role("button", name="Zoom in preview", exact=True).click()
    expect(preview_canvas).to_have_attribute("data-zoom", "2")
    expect(preview_canvas).to_have_attribute("tabindex", "0")
    dialog.get_by_role("button", name="Fit preview", exact=True).click()
    expect(preview_canvas).to_have_attribute("data-zoom", "1")
    dialog.locator(".figure-export-layout").evaluate("el => { el.scrollTop = 0; }")
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
    ("language", "format", "width", "height", "example"),
    [
        ("zh", "PNG", 390, 775, None),
        ("en", "PNG", 320, 568, None),
        ("en", "PNG", 568, 320, None),
        ("en", "PNG", 1110, 580, None),
        ("en", "SVG", 390, 775, None),
        ("en", "SVG", 1001, 600, "library.import"),
        ("en", "PNG", 1001, 600, "drugclip.index"),
        ("zh", "PNG", 1024, 600, "screening.dock"),
        ("en", "SVG", 1001, 600, "admet.predict"),
    ],
)
def test_native_figure_stays_accessible_in_short_windows(language, format, width, height, example):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    key = f"{language}-{format.lower()}-{width}-{example or 'default'}"
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
        launcher = trigger_for(page, base, language, format, example)
        expect(launcher).to_be_enabled(timeout=45000)
        launcher.press("Enter")
        dialog = page.get_by_role("dialog")
        close = dialog.get_by_role("button", name="关闭" if zh else "Close", exact=True)
        expect(close).to_be_focused()
        zoom = dialog.get_by_role(
            "button", name="放大预览" if zh else "Zoom in preview", exact=True
        )
        expect(zoom).to_be_enabled(timeout=45000)
        page.keyboard.press("Tab")
        expect(zoom).to_be_focused()
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
            dialog.locator(".figure-export-layout").evaluate("el => { el.scrollTop = 0; }")
            layout = geometry(dialog)
            assert_first_screen(layout, stacked=width <= 390)
            if width <= 390 or example:
                assert_options_fit(dialog)
            if example:
                assert layout["optionsFit"], layout
                assert layout["preview"]["height"] >= 345, layout
                gap = layout["previewControls"]["top"] - layout["preview"]["bottom"]
                assert 0 <= gap <= 12, layout
                visible_top = layout["body"]["top"]
                visible_bottom = layout["body"]["bottom"] + 1
                assert layout["spec"]["bottom"] <= visible_bottom, layout
                assert all(
                    visible_top <= label["top"] <= label["bottom"] <= visible_bottom
                    for label in layout["labels"]
                ), layout
                figure = layout["fittedImage"]
                assert figure and (
                    figure["width"] >= layout["preview"]["width"] * 0.85
                    or figure["height"] >= layout["preview"]["height"] * 0.85
                ), layout
                zoom.click()
                expect(dialog.locator(".figure-export-canvas")).to_have_attribute("data-zoom", "2")
                dialog.get_by_role("button", name="适应窗口" if zh else "Fit preview").click()
                expect(dialog.locator(".figure-export-canvas")).to_have_attribute("data-zoom", "1")
            if width == 320:
                check_short_body_scroll(page, dialog, layout)
            if format == "SVG" and not example:
                page.set_viewport_size({"width": 1440, "height": 900})
                desktop = geometry(dialog)
                assert_first_screen(desktop, stacked=False)
                assert desktop["preview"]["height"] >= 480
                page.set_viewport_size({"width": width, "height": height})
                assert_first_screen(geometry(dialog), stacked=True)
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
        elif example:
            root = ET.fromstring(figure.read_bytes())
            assert root.attrib["width"] == "89mm"
            assert len(root.findall(".//{http://www.w3.org/2000/svg}path")) > 10
        else:
            inspect_svg(figure, "Å")
        assert page.request.get(base + "/api/jobs").json() == jobs
        browser.close()
