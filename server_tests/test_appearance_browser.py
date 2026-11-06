"""Three real rendered themes, pre-paint restore and same-origin preview sync."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

PALETTES = {
    "warm": ("Warm", "暖色", "#faf8f3", "#ffffff"),
    "light": ("White", "白色", "#ffffff", "#ffffff"),
    "dark": ("Night black", "夜间黑色", "#0c0f14", "#151a21"),
}


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_three_themes_across_settings_tabs_and_preview(language, width):
    root = Path("outputs/appearance") / f"{language}-{width}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    writes, errors, measurements = [], [], []
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(
            args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
        )
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        context.on(
            "page", lambda page: page.on("pageerror", lambda error: errors.append(str(error)))
        )
        context.on(
            "request",
            lambda req: (
                writes.append(req.url)
                if req.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in req.url
                else None
            ),
        )
        page = context.new_page()
        page.goto(base + "/#view=settings")
        group = page.get_by_role(
            "group", name="外观主题" if language == "zh" else "Appearance", exact=True
        )
        expect(group.get_by_role("radio")).to_have_count(3)
        expect(
            group.get_by_role("radio", name="暖色" if language == "zh" else "Warm", exact=True)
        ).to_be_checked()
        other = context.new_page()
        other.goto(base + "/#view=settings")
        preview = context.new_page()
        preview.goto(base + "/viewer.html")
        expect(preview.locator("canvas").first).to_be_attached()

        for theme, (en, cn, canvas, chart) in PALETTES.items():
            label = cn if language == "zh" else en
            choice = group.get_by_role("radio", name=label, exact=True)
            choice.check()
            expect(choice).to_be_checked()
            for target in (page, other, preview):
                expect(target.locator("html")).to_have_attribute("data-theme", theme)
                assert (
                    target.evaluate(
                        "getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()"
                    )
                    == canvas
                )
            assert (
                preview.evaluate(
                    "getComputedStyle(document.documentElement).getPropertyValue('--chart-bg').trim()"
                )
                == chart
            )
            expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", canvas)
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            expect(group.get_by_role("radio", name=label, exact=True)).to_be_checked()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            options = page.locator(".theme-option")
            boxes = [option.bounding_box() for option in options.all()]
            assert all(box and box["width"] >= 180 for box in boxes)
            if width > 640:
                assert max(box["y"] for box in boxes) - min(box["y"] for box in boxes) < 1
            else:
                assert boxes[0]["y"] + boxes[0]["height"] <= boxes[1]["y"]
            page.screenshot(path=root / f"settings-{theme}.png", full_page=True)
            measurements.append(
                {
                    "theme": theme,
                    "canvas": canvas,
                    "preview_background": chart,
                    "cross_tab_sync": True,
                    "refresh_persistence": True,
                    "width": width,
                }
            )
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "cases": measurements,
                    "writes": writes,
                    "scientific_calculations": 0,
                },
                indent=2,
            )
        )
        browser.close()
