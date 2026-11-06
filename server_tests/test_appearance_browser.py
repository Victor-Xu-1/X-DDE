"""Three real rendered themes, pre-paint restore and same-origin preview sync."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.appearance_preview import load_reference, reference_asset, rendered_background
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import settings

PALETTES = {
    "warm": ("Warm", "暖色", "#faf8f3", "#ffffff"),
    "light": ("White", "白色", "#ffffff", "#ffffff"),
    "dark": ("Night black", "夜间黑色", "#0c0f14", "#151a21"),
}


def canonical_hex(value):
    value = value.strip().lower()
    if len(value) == 4 and value.startswith("#"):
        value = "#" + "".join(channel * 2 for channel in value[1:])
    return value


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_three_themes_across_settings_tabs_and_preview(language, width):
    root = Path("outputs/appearance") / f"{language}-{width}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    writes, errors, measurements = [], [], []
    asset, checksum = reference_asset(state)
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(
            args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
        )
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.add_init_script(
            f"if (location.origin === {json.dumps(base)}) "
            f"localStorage.setItem('opendde-workbench.language','{language}')"
        )
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
        page.goto(base)
        settings(page, language)
        group = page.get_by_role(
            "group", name="外观主题" if language == "zh" else "Appearance", exact=True
        )
        expect(group.get_by_role("radio")).to_have_count(3)
        expect(
            group.get_by_role("radio", name="暖色" if language == "zh" else "Warm", exact=True)
        ).to_be_checked()
        other = context.new_page()
        other.goto(base)
        settings(other, language)
        preview = context.new_page()
        preview.goto(base + "/viewer.html")
        expect(preview.locator("canvas").first).to_be_attached()
        structure = load_reference(preview, base, asset, checksum)

        for theme, (en, cn, canvas, chart) in PALETTES.items():
            label = cn if language == "zh" else en
            choice = group.get_by_role("radio", name=label, exact=True)
            choice.check()
            expect(choice).to_be_checked()
            for target in (page, other, preview):
                expect(target.locator("html")).to_have_attribute("data-theme", theme)
                assert (
                    canonical_hex(
                        target.evaluate(
                            "getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()"
                        )
                    )
                    == canvas
                )
            assert (
                canonical_hex(
                    preview.evaluate(
                        "getComputedStyle(document.documentElement).getPropertyValue('--chart-bg').trim()"
                    )
                )
                == chart
            )
            assert (
                canonical_hex(page.locator('meta[name="theme-color"]').get_attribute("content"))
                == canvas
            )
            rgba = rendered_background(preview, root / f"renderer-background-{theme}.png")
            expected_rgb = [int(chart[index : index + 2], 16) for index in (1, 3, 5)]
            assert all(abs(a - b) <= 1 for a, b in zip(rgba[:3], expected_rgb, strict=True)), (
                theme,
                rgba,
            )
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            settings(page, language)
            expect(group.get_by_role("radio", name=label, exact=True)).to_be_checked()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            options = page.locator(".theme-option")
            boxes = [option.bounding_box() for option in options.all()]
            assert all(box and box["width"] >= 180 for box in boxes)
            if width > 640:
                assert max(box["y"] for box in boxes) - min(box["y"] for box in boxes) < 1
                titles = [
                    item.bounding_box()["y"]
                    for item in page.locator(".theme-option > strong").all()
                ]
                assert max(titles) - min(titles) < 1
            else:
                assert boxes[0]["y"] + boxes[0]["height"] <= boxes[1]["y"]
            page.screenshot(path=root / f"settings-{theme}.png", full_page=True)
            measurements.append(
                {
                    "theme": theme,
                    "canvas": canvas,
                    "preview_background": chart,
                    "native_renderer_background_rgba": rgba,
                    "preview_verification": "Composited native STAT6 structure screenshot",
                    "reference_structure_atoms": structure["atoms"],
                    "cross_tab_sync": True,
                    "refresh_persistence": True,
                    "width": width,
                }
            )
        assert not errors and not writes, (errors, writes)
        assert page.request.get(base + "/api/jobs").json() == []
        assert (
            hashlib.sha256(page.request.get(base + "/api/assets/" + asset.id).body()).hexdigest()
            == checksum
        )
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
