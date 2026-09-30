"""Real browser regression for the shared appearance and scientific asset workflow.

Runs against a built, isolated service in CI. It does not submit scientific tasks.
"""

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ETHANOL = """ethanol
  X-DDE browser fixture

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
$$$$
"""


def open_settings(page):
    page.get_by_role("button", name="账户与设置", exact=True).click()
    page.get_by_role("menuitem", name="账户与设置", exact=True).click()
    expect(page.get_by_role("heading", name="账户与设置", exact=True)).to_be_visible()


def select_molecule(page):
    page.get_by_role("button", name="资产与关系", exact=True).click()
    page.get_by_role("button", name="分子 ethanol.sdf", exact=True).first.click()
    expect(page.get_by_role("heading", name="ethanol.sdf", exact=True)).to_be_visible()


def contrast_ratio(first, second):
    def luminance(color):
        values = [float(part) / 255 for part in color.split("(")[1].split(")")[0].split(",")]
        values = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
        return sum(v * weight for v, weight in zip(values, (0.2126, 0.7152, 0.0722), strict=True))

    a, b = sorted((luminance(first), luminance(second)))
    return (b + 0.05) / (a + 0.05)


def test_themes_navigation_and_persisted_asset_handoff(tmp_path):
    base_url = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    molecule = tmp_path / "ethanol.sdf"
    molecule.write_text(ETHANOL)
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base_url)
            logo = page.get_by_role("img", name="X-DDE 药物研究工作台", exact=True)
            expect(logo).to_be_visible()
            assert logo.evaluate("node => node.complete && node.naturalWidth > 0")
            favicon = page.locator('link[rel="icon"]').get_attribute("href")
            assert favicon == "/brand/favicon.png"
            assert page.request.get(base_url + favicon).status == 200

            expect(page.get_by_role("heading", name="全部能力", exact=True)).to_be_visible()
            page.get_by_role("button", name="资产与关系", exact=True).click()
            expect(page.get_by_text("从第一份研究资产开始", exact=True)).to_be_visible()
            page.locator('.research-workspace input[type="file"]').set_input_files(molecule)
            expect(page.get_by_role("heading", name="ethanol.sdf", exact=True)).to_be_visible()
            page.get_by_role("textbox", name="研究备注", exact=True).fill(
                "Browser regression: retained original"
            )
            page.get_by_role(
                "combobox", name="人工评价（不代表模型分数）", exact=True
            ).select_option("4")
            page.get_by_role("button", name="保存备注为新版本", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="已保存")).to_be_visible()
            objects = page.request.get(base_url + "/api/research/objects").json()
            assert len(objects) == 2
            current = next(item for item in objects if item["notes"])
            original = next(item for item in objects if not item["notes"])
            assert current["parent_id"] == original["id"]
            assert current["reference"]["sha256"] == original["reference"]["sha256"]

            for theme, label in (("warm", "暖色"), ("light", "纯白"), ("dark", "夜间黑")):
                open_settings(page)
                page.get_by_role("radio", name=label, exact=True).check()
                expect(page.locator("html")).to_have_attribute("data-theme", theme)
                select_molecule(page)
                colors = page.locator(".relationship-node.selected").evaluate(
                    """node => ({
                        text: getComputedStyle(node.querySelector('text:not(.graph-kind)')).fill,
                        background: getComputedStyle(node.querySelector('rect')).fill
                    })"""
                )
                assert contrast_ratio(colors["text"], colors["background"]) >= 4.5
                save_colors = page.get_by_role("button", name="保存备注为新版本").evaluate(
                    """button => ({
                        text: getComputedStyle(button).color,
                        background: getComputedStyle(button).backgroundColor
                    })"""
                )
                assert contrast_ratio(save_colors["text"], save_colors["background"]) >= 4.5
                for width in (390, 768, 1440):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                page.screenshot(path=str(evidence / f"assets-{theme}.png"))

            page.get_by_role("button", name="账户与设置", exact=True).click()
            page.get_by_role("menuitem", name="运行状态", exact=True).click()
            expect(page.get_by_role("heading", name="X-DDE 平台后端", exact=True)).to_be_visible()
            expect(page.get_by_text("平台服务就绪", exact=True)).to_be_visible()
            health = page.request.get(base_url + "/api/health").json()
            assert health["platform"] == {"name": "X-DDE", "ready": True}
            assert set(health["engines"]) == {"opendde", "diffsbdd", "harness"}
            for name in ("OpenDDE · 集成环境", "DiffSBDD · 集成环境", "OpenDDE Harness · 集成环境"):
                expect(page.get_by_role("heading", name=name, exact=True)).to_be_visible()
            for width in (390, 768, 1440):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
            page.screenshot(path=str(evidence / "xdde-runtime.png"))
            page.get_by_role("button", name="管理集成环境", exact=True).click()
            expect(
                page.get_by_role("heading", name="X-DDE 集成环境管理", exact=True)
            ).to_be_visible()
            deployment = page.request.get(base_url + "/api/deployment").json()
            for engine in deployment["engines"].values():
                group = page.get_by_role("region", name=engine["name"] + " · 集成环境与模型")
                expect(group).to_be_visible()
            expect(
                page.get_by_role("button", name="安装 DiffSBDD 小分子设计环境", exact=False)
            ).to_be_visible()
            catalogue = deployment["packages"]
            for package in catalogue:
                if package["id"].startswith("diffsbdd"):
                    expect(
                        page.get_by_role("heading", name=package["name"], exact=True)
                    ).to_be_visible()

            trigger = page.get_by_role("button", name="账户与设置", exact=True)
            trigger.click()
            page.keyboard.press("End")
            expect(page.get_by_role("menuitem", name="帮助中心", exact=True)).to_be_focused()
            page.keyboard.press("Escape")
            expect(trigger).to_be_focused()
            expect(page.get_by_role("menu")).to_have_count(0)

            open_settings(page)
            page.get_by_label("界面语言").select_option("en")
            page.reload()
            expect(page.locator("html")).to_have_attribute("data-theme", "dark")
            page.get_by_role("button", name="Assets & relationships", exact=True).click()
            page.get_by_role("button", name="Molecule ethanol.sdf", exact=True).first.click()
            expect(page.get_by_role("textbox", name="Research notes", exact=True)).to_have_value(
                current["notes"]
            )
            page.get_by_role("button", name="Use for properties", exact=True).click()
            expect(page.get_by_text("Only this record is calculated", exact=False)).to_be_visible()
            expect(
                page.get_by_role("combobox", name="Molecule file (multiple records allowed)")
            ).to_have_value(current["reference"]["asset_id"])
            assert page.request.get(base_url + "/api/jobs").json() == []
            assert not errors
        finally:
            page.screenshot(path=str(evidence / "final-browser-state.png"), full_page=True)
            context.close()
            browser.close()


def test_compact_transparent_brand():
    """Check actual PNG alpha and visible brand geometry at every supported theme/width."""
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            raster = page.evaluate(
                """async () => {
                    const result = {};
                    for (const name of ['x-dde-logo.png', 'x-dde-mark.png',
                            'x-dde-wordmark.png', 'favicon.png', 'apple-touch-icon.png']) {
                        const image = new Image();
                        image.src = '/brand/' + name;
                        await image.decode();
                        const canvas = document.createElement('canvas');
                        canvas.width = image.naturalWidth;
                        canvas.height = image.naturalHeight;
                        const context = canvas.getContext('2d', {willReadFrequently: true});
                        context.drawImage(image, 0, 0);
                        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                        let clear = 0, solid = 0;
                        for (let offset = 3; offset < pixels.length; offset += 4) {
                            if (pixels[offset] === 0) clear++;
                            if (pixels[offset] >= 200) solid++;
                        }
                        const count = canvas.width * canvas.height;
                        result[name] = {
                            clear: clear / count, solid: solid / count,
                            corners: [0, canvas.width - 1,
                                (canvas.height - 1) * canvas.width, count - 1]
                                .map(index => pixels[index * 4 + 3])
                        };
                    }
                    return result;
                }"""
            )
            for asset, alpha in raster.items():
                assert alpha["corners"] == [0, 0, 0, 0], asset
                assert alpha["clear"] > 0.25, asset
                assert alpha["solid"] > 0.1, asset
            for theme, label in (("warm", "暖色"), ("light", "纯白"), ("dark", "夜间黑")):
                page.set_viewport_size({"width": 1440, "height": 1000})
                open_settings(page)
                page.get_by_role("radio", name=label, exact=True).check()
                expect(page.locator("html")).to_have_attribute("data-theme", theme)
                page.get_by_role("button", name="全部能力", exact=True).click()
                for width in (390, 768, 1440):
                    page.set_viewport_size({"width": width, "height": 1000})
                    brand = page.get_by_role("button", name="X-DDE", exact=True)
                    expect(brand).to_be_visible()
                    mark = brand.locator(".studio-brand-mark")
                    expect(mark).to_be_visible()
                    assert mark.evaluate("node => node.complete && node.naturalWidth > 0")
                    mark_box = mark.bounding_box()
                    assert 20 <= mark_box["width"] <= 24.5
                    assert 20 <= mark_box["height"] <= 24.5
                    assert 40 <= brand.bounding_box()["height"] <= 48
                    assert page.get_by_role("navigation", name="主导航").bounding_box()["y"] < 120
                    assert (
                        brand.evaluate("node => getComputedStyle(node).backgroundColor")
                        == "rgba(0, 0, 0, 0)"
                    )
                    wordmark = brand.locator(".studio-brand-wordmark")
                    if width > 960:
                        expect(wordmark).to_be_visible()
                        assert 80 <= wordmark.bounding_box()["width"] <= 84.5
                        assert wordmark.bounding_box()["height"] < 20
                        assert wordmark.evaluate("node => getComputedStyle(node).filter") == (
                            "brightness(0) invert(1)" if theme == "dark" else "none"
                        )
                    else:
                        expect(wordmark).to_be_hidden()
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    page.screenshot(path=str(evidence / f"brand-{theme}-{width}.png"))
                page.get_by_role("button", name="X-DDE", exact=True).click()
                expect(page.get_by_role("heading", name="全部能力", exact=True)).to_be_visible()
            assert not errors
        finally:
            page.close()
            browser.close()
