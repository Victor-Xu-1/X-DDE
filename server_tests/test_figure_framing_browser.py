"""Verify export magnification using an archived STAT6 ligand and the real 3D renderer."""

from base64 import b64encode
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import open_navigation


def figure_pixels(page, file):
    return page.evaluate(
        """async source => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + source;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const rgba = context.getImageData(0, 0, image.width, image.height).data;
          let left = image.width, right = -1, top = image.height, bottom = -1;
          for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
              if (rgba[(y * image.width + x) * 4 + 3] === 0) continue;
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
          return {width: image.width, height: image.height, left, right, top, bottom};
        }""",
        b64encode(file.read_bytes()).decode("ascii"),
    )


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_archived_ligand_framing_preserves_live_camera(language, width):
    evidence = Path("outputs/publication-browser/framing")
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    state = Settings.from_env().state_dir
    with platform(state, evidence / f"{language}.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 975})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}')"
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="高通量筛选" if zh else "High-throughput screening", exact=True
        ).click()
        page.locator(".module-task-picker select:visible").select_option("drugclip.screen")
        page.get_by_role(
            "button", name="示例结果" if zh else "Example results", exact=True
        ).click()
        candidate = page.locator(".dataset-preview-pane")
        panel = candidate.locator(".viewer-panel")
        trigger = panel.get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
        )
        expect(trigger).to_be_enabled(timeout=45000)
        source = candidate.get_by_role(
            "link", name="下载原始结果结构" if zh else "Download original result structure"
        ).get_attribute("href")
        original = page.request.get(base + source).body()
        assert b"M  END" in original
        iframe = panel.locator("iframe").first

        def camera():
            return iframe.evaluate(
                "f => f.contentWindow.document.querySelector('canvas')._3dmol_viewer.getView()"
            )

        baseline = camera()

        def export_at(scale):
            def configure(dialog):
                dialog.get_by_role(
                    "combobox", name="图件比例" if zh else "Panel layout"
                ).select_option("landscape")
                dialog.get_by_role(
                    "combobox", name="清晰度" if zh else "Resolution", exact=True
                ).select_option("300")
                dialog.get_by_role(
                    "checkbox", name="透明背景" if zh else "Transparent background"
                ).check()
                dialog.get_by_role(
                    "combobox", name="结构大小" if zh else "Structure size", exact=True
                ).select_option(scale)

            png = export_figure(
                page, trigger, evidence, f"{language}-{scale}x", language, configure=configure
            )
            inspect_png(png, dpi=300, width=1051)
            assert camera() == baseline
            return figure_pixels(page, png)

        before, after = export_at("1"), export_at("1.5")
        assert (before["width"], before["height"]) == (1051, 701)
        assert (after["width"], after["height"]) == (1051, 701)
        assert 0 < after["left"] < after["right"] < after["width"] - 1
        assert 0 < after["top"] < after["bottom"] < after["height"] - 1
        assert after["right"] - after["left"] > 1.25 * (before["right"] - before["left"]), (
            before,
            after,
        )
        assert page.request.get(base + source).body() == original
        assert page.request.get(base + "/api/jobs").json() == jobs
        browser.close()
