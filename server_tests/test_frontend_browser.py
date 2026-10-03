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
    page.get_by_role("button", name="研究资产", exact=True).click()
    page.get_by_role("button", name="分子: ethanol.sdf", exact=True).first.click()
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
            expect(page.locator("html")).to_have_attribute("data-theme", "light")
            page.evaluate("localStorage.setItem('x-dde-theme', 'warm')")
            page.reload()
            expect(page.locator("html")).to_have_attribute("data-theme", "light")
            expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", "#f8faf9")
            logo = page.get_by_role("img", name="X-DDE 药物研究工作台", exact=True)
            expect(logo).to_be_visible()
            page.wait_for_function(
                "node => node.complete && node.naturalWidth > 0",
                arg=logo.element_handle(),
                timeout=10000,
            )
            assert logo.evaluate("node => node.complete && node.naturalWidth > 0")
            favicon = page.locator('link[rel="icon"]').get_attribute("href")
            assert favicon == "/brand/favicon.png"
            assert page.request.get(base_url + favicon).status == 200

            expect(page.get_by_role("heading", name="全部能力", exact=True)).to_be_visible()
            page.get_by_role("button", name="研究资产", exact=True).click()
            expect(page.get_by_text("从第一份研究资产开始", exact=True)).to_be_visible()
            page.locator('.research-workspace input[type="file"]').set_input_files(molecule)
            expect(page.get_by_role("heading", name="ethanol.sdf", exact=True)).to_be_visible()
            page.get_by_text("名称、备注与人工评价",exact=True).click()
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

            for theme, label in (("light", "浅色"), ("dark", "深色")):
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
            assert set(health["engines"]) == {
                "opendde",
                "diffsbdd",
                "harness",
                "p2rank",
                "gnina",
                "chemistry",
                "biopython",
                "discovery",
                "anarcii",
                "posebusters",
                "admet",
                "sapiens",
            }
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
            page.get_by_role("button", name="Research assets", exact=True).click()
            page.get_by_role("button", name="Molecule ethanol.sdf", exact=True).first.click()
            expect(page.get_by_role("textbox", name="Research notes", exact=True)).to_have_value(
                current["notes"]
            )
            page.get_by_role("button", name="Use for properties", exact=True).click()
            page.get_by_role("button", name="Next", exact=True).click()
            expect(page.get_by_text("only this record is calculated", exact=False)).to_be_visible()
            expect(
                page.get_by_role("combobox", name="Molecule file (multiple records allowed)")
            ).to_have_value(current["reference"]["asset_id"])
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
                page.get_by_role(
                    "heading", name="2. Provide molecules", exact=True
                ).scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / f"guided-property-input-{width}.png"))
            page.get_by_role("button", name="Next", exact=True).click()
            page.get_by_role("textbox", name="Task name (optional)", exact=True).fill(
                "Guided property review"
            )
            page.get_by_role("button", name="Next", exact=True).click()
            expect(
                page.get_by_role("button", name="Calculate properties", exact=True)
            ).to_be_disabled()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
                page.get_by_role(
                    "heading", name="4. Review & start", exact=True
                ).scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / f"guided-property-review-{width}.png"))
            page.get_by_role("button", name="Back", exact=True).click()
            expect(
                page.get_by_role("textbox", name="Task name (optional)", exact=True)
            ).to_have_value("Guided property review")
            page.get_by_role("button", name="Back", exact=True).click()
            expect(
                page.get_by_role(
                    "combobox", name="Molecule file (multiple records allowed)", exact=True
                )
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
            for theme, label in (("light", "浅色"), ("dark", "深色")):
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


def test_diffsbdd_forms_expose_real_contracts_without_dispatch():
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            csrf = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/session").json()[
                "csrf_token"
            ]
            uploaded = page.request.post(
                os.environ["WB_BROWSER_URL"] + "/api/assets?kind=ligand&name=core-form-record.sdf",
                data=ETHANOL.encode(),
                headers={"Content-Type": "application/octet-stream", "X-Workbench-CSRF": csrf},
            )
            assert uploaded.status == 201
            molecule_id = uploaded.json()["id"]
            protein_upload = page.request.post(
                os.environ["WB_BROWSER_URL"] + "/api/assets?kind=structure&name=core-receptor.pdb",
                data=(
                    b"ATOM      1  CA  ALA A  10       1.000   2.000   3.000"
                    b"  1.00 20.00           C\n"
                    b"END\n"
                ),
                headers={"Content-Type": "application/octet-stream", "X-Workbench-CSRF": csrf},
            )
            assert protein_upload.status == 201
            protein_id = protein_upload.json()["id"]

            for title in [
                "口袋条件分子生成",
                "局部重设计",
                "分子多样化",
                "分子优化",
                "口袋检查",
                "准备受体结构",
                "分子相互作用",
                "候选描述符",
                "候选导出",
            ]:
                page.get_by_role("button", name=title, exact=True).click()
                expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
                expect(page.get_by_role("button", name="下一步", exact=True)).to_be_visible()
                expect(
                    page.locator(".questionnaire:visible > fieldset:not([hidden])")
                ).to_have_count(1)
                expect(page.get_by_role("button", name="创建任务", exact=True)).to_have_count(0)
                if title == "局部重设计":
                    page.get_by_role("radiogroup", name="1. 选择 PDB 受体", exact=True).get_by_role(
                        "radio", name="上传或选择文件", exact=True
                    ).check()
                    page.get_by_role("combobox", name="1. 选择 PDB 受体", exact=True).focus()
                    page.get_by_role("combobox", name="1. 选择 PDB 受体", exact=True).select_option(
                        protein_id
                    )
                    page.get_by_role(
                        "radiogroup", name="选择与受体对齐的三维 SDF 分子", exact=True
                    ).get_by_role("radio", name="上传或选择文件", exact=True).check()
                    molecule_select = page.get_by_role(
                        "combobox", name="选择与受体对齐的三维 SDF 分子", exact=True
                    )
                    molecule_select.focus()
                    molecule_select.select_option(molecule_id)
                    page.get_by_role("button", name="下一步", exact=True).click()
                    hint = page.get_by_text(
                        "固定区域会独立复核；违反要求或无法确认的候选不会自动复用。", exact=True
                    )
                    expect(hint).to_be_visible()
                    assert "0.5 Å" in hint.get_attribute("title")
                    picker = page.get_by_role("button", name="读取可选原子", exact=True)
                    expect(picker).to_have_count(1)
                    for _ in range(3):
                        page.get_by_role("button", name="上一步", exact=True).click()
                        page.get_by_role("button", name="下一步", exact=True).click()
                        expect(picker).to_have_count(1)
                    page.screenshot(
                        path=str(evidence / "fixed-picker-after-updates.png"), full_page=True
                    )

                for width in (390, 768, 1440):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                page.screenshot(path=str(evidence / ("diff-" + title + ".png")), full_page=True)
                page.get_by_role("button", name="返回全部能力", exact=True).click()
            assert page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json() == []
            assert not errors
        finally:
            browser.close()


def test_research_plan_can_be_saved_reopened_and_reviewed_without_starting_science():
    import json

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            page.get_by_role("button", name="研究计划与连续任务", exact=True).click()
            page.get_by_role("button", name="专家完整计划", exact=True).click()
            page.get_by_role("button", name="下一步", exact=True).click()
            plan = {
                "name": "Browser saved plan",
                "steps": [
                    {
                        "id": "properties",
                        "request": {
                            "operation": "properties",
                            "name": "from plan",
                            "smiles": ["CCO"],
                        },
                    }
                ],
                "budget": {"max_jobs": 1, "wall_seconds": 3600},
            }
            page.get_by_role("textbox", name="完整计划、依赖、输出角色与预算", exact=True).fill(
                json.dumps(plan)
            )
            page.get_by_role("button", name="下一步", exact=True).click()
            page.get_by_role("button", name="下一步", exact=True).click()
            page.get_by_role("button", name="保存计划（不执行）", exact=True).click()
            expect(
                page.get_by_role("heading", name="Browser saved plan", exact=True)
            ).to_be_visible()
            expect(page.get_by_role("button", name="运行这个计划", exact=True)).to_be_enabled()
            for width in (390, 768, 1440):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
            page.reload()
            page.get_by_role("button", name="研究计划与连续任务", exact=True).click()
            saved = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/workflows/plans").json()
            target = next(p for p in saved if p["body"]["name"] == "Browser saved plan")
            page.get_by_role("combobox", name="如何准备研究计划？", exact=True).select_option(
                "saved"
            )
            page.get_by_role("combobox", name="打开已保存计划", exact=True).select_option(
                target["id"]
            )
            for _ in range(3):
                page.get_by_role("button", name="下一步", exact=True).click()
            expect(
                page.get_by_role("heading", name="Browser saved plan", exact=True)
            ).to_be_visible()
            assert page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json() == []
            page.screenshot(path="server_tests/evidence/research-plan.png", full_page=True)
        finally:
            browser.close()


def test_real_pdb_preview_selects_version_bound_pocket_residues_without_running_science():
    base = os.environ["WB_BROWSER_URL"]
    protein = (
        "ATOM      1  CA  ALA A  10       0.000   0.000   0.000  1.00 20.00           C  \n"
        "ATOM      2  CA  GLY A  11       3.800   0.000   0.000  1.00 20.00           C  \n"
        "END\n"
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        try:
            page.goto(base)
            csrf = page.request.get(base + "/api/session").json()["csrf_token"]
            response = page.request.post(
                base + "/api/assets?kind=structure&name=pocket-browser.pdb",
                data=protein,
                headers={"X-Workbench-CSRF": csrf, "Content-Type": "application/octet-stream"},
            )
            assert response.status == 201
            asset = response.json()
            page.get_by_role("button", name="口袋条件分子生成", exact=True).click()
            page.get_by_role("radiogroup", name="1. 选择 PDB 受体", exact=True).get_by_role(
                "radio", name="上传或选择文件", exact=True
            ).check()
            picker = page.get_by_role("combobox", name="1. 选择 PDB 受体", exact=True)
            picker.focus()
            expect(picker.locator('option[value="' + asset["id"] + '"]')).to_have_count(1)
            picker.select_option(asset["id"])
            page.get_by_role("button", name="下一步", exact=True).click()
            expect(page.get_by_role("heading", name="三维结构与口袋", exact=False)).to_be_visible()
            page.get_by_text("从列表选择残基", exact=True).click()
            active_panel = page.locator(
                ".questionnaire:visible > fieldset:not([hidden])"
            ).bounding_box()
            footer = page.locator(".questionnaire:visible > .questionnaire-actions").bounding_box()
            assert active_panel and footer
            assert footer["y"] >= active_panel["y"] + active_panel["height"] - 1
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            chosen = page.get_by_role("textbox", name="已选残基（也可输入 A:10, A:11）", exact=True)
            expect(chosen).to_have_value("A:10")
            page.get_by_role("button", name="A:GLY11", exact=True).click()
            expect(chosen).to_have_value("A:10, A:11")
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            expect(chosen).to_have_value("A:11")
            expect(page.get_by_role("button", name="创建任务", exact=True)).to_have_count(0)
            assert page.request.get(base + "/api/jobs").json() == []
            page.screenshot(path="server_tests/evidence/pocket-selection.png", full_page=True)
        finally:
            browser.close()


def test_compact_core_navigation_and_overlapping_drug_modalities(tmp_path):
    base_url = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base_url)
            center = page.locator(".tool-center")
            expect(center.get_by_role("heading", name="全部能力", exact=True)).to_be_visible()
            for name in ("生物药", "抗体", "蛋白"):
                center.get_by_role("button", name=name, exact=True).click()
                expect(
                    center.get_by_role("button", name="抗体设计与 CDR 优化", exact=True)
                ).to_be_visible()
                expect(
                    center.get_by_role("button", name="计算小分子性质", exact=True)
                ).to_have_count(0)
            center.get_by_role("button", name="小分子", exact=True).click()
            expect(
                center.get_by_role("button", name="口袋条件分子生成", exact=True)
            ).to_be_visible()
            expect(
                center.get_by_role("button", name="发现多个候选口袋", exact=True)
            ).to_be_visible()
            expect(
                center.get_by_role("button", name="抗体设计与 CDR 优化", exact=True)
            ).to_have_count(0)
            expect(center.get_by_role("searchbox")).to_have_count(0)
            expect(center.get_by_role("combobox")).to_have_count(0)
            expect(page.locator(".onboarding-banner")).to_have_count(0)
            for width in (390, 768, 1440):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
                bounds = center.locator(".tool-groups").bounding_box()
                assert bounds is not None
                for button in center.locator(".tool-groups button").all():
                    box = button.bounding_box()
                    assert box is not None
                    assert box["x"] >= bounds["x"] - 1
                    assert box["x"] + box["width"] <= bounds["x"] + bounds["width"] + 1
                page.screenshot(path=str(evidence / f"modalities-small-molecule-{width}.png"))
            center.locator(".tool-groups").get_by_role(
                "button", name="全部能力", exact=True
            ).click()
            center.get_by_role("button", name="RNA", exact=True).click()
            expect(
                center.get_by_role("button", name="预测分子与复合物结构", exact=True)
            ).to_be_visible()
            expect(center.get_by_role("button", name="准备 MSA 与模板", exact=True)).to_be_visible()
            expect(
                center.get_by_role("button", name="抗体设计与 CDR 优化", exact=True)
            ).to_have_count(0)
            assert "不是通用 RNA 药物设计" in center.get_by_role(
                "button", name="RNA", exact=True
            ).get_attribute("title")
            page.screenshot(path=str(evidence / "modalities-rna.png"))
            navigation = page.get_by_role("navigation", name="主导航")
            labels = navigation.get_by_role("button").evaluate_all(
                "nodes => nodes.map(node => node.getAttribute('aria-label'))"
            )
            assert labels[:11] == [
                "疾病找靶点",
                "靶点与研究材料",
                "结构预测",
                "受体构象",
                "口袋寻找",
                "结合模式",
                "分子准备",
                "分子生成",
                "抗体设计",
                "性质计算",
                "分子编辑",
            ]
            for label, heading in (
                ("口袋寻找", "发现多个候选口袋"),
                ("分子准备", "准备分子状态与构象"),
                ("分子生成", "口袋条件分子生成"),
                ("性质计算", "计算小分子性质"),
            ):
                navigation.get_by_role("button", name=label, exact=True).click()
                expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
                assert page.locator(".studio-intro").count() == 0
                if label == "口袋寻找":
                    expect(
                        page.get_by_text("P2Rank 预测蛋白表面的候选位点。", exact=False)
                    ).to_have_count(0)

            navigation.get_by_role("button", name="全部能力", exact=True).click()
            page.screenshot(path=str(evidence / "compact-core-navigation.png"))
            catalogue = page.request.get(base_url + "/api/capabilities").json()
            antibody = next(item for item in catalogue["capabilities"] if item["id"] == "campaign")
            assert antibody["modalities"] == ["biologic", "antibody", "protein"]
            assert page.request.get(base_url + "/api/jobs").json() == []
            assert errors == []
        finally:
            browser.close()


def test_binding_pose_entry_presets_and_configuration_limits():
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base)
            page.get_by_role("button", name="结合模式", exact=True).click()
            expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
            csrf = page.request.get(base + "/api/session").json()["csrf_token"]
            uploaded = page.request.post(
                base + "/api/assets?kind=structure&name=docking-center.pdb",
                data=(
                    b"ATOM      1  CA  ALA A  10    "
                    b"   1.000   2.000   3.000  1.00 50.00           C  \nEND\n"
                ),
                headers={"Content-Type": "application/octet-stream", "X-Workbench-CSRF": csrf},
            )
            assert uploaded.status == 201
            asset = uploaded.json()
            page.get_by_role("radiogroup", name="受体结构", exact=True).get_by_role(
                "radio", name="上传或选择文件", exact=True
            ).check()
            receptor = page.get_by_role("combobox", name="受体结构", exact=True)
            receptor.focus()
            expect(receptor.locator('option[value="' + asset["id"] + '"]')).to_have_count(1)
            receptor.select_option(asset["id"])
            # Save/reuse a real task condition through API/SQLite without dispatching science.
            ligand_upload = page.request.post(
                base + "/api/assets?kind=ligand&name=constraint-carbon.sdf",
                data=(
                    b"Carbon\n  X-DDE\n\n  1  0  0  0  0  0            999 V2000\n"
                    b"    1.0000    2.0000    3.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n"
                    b"M  END\n$$$$\n"
                ),
                headers={"Content-Type": "application/octet-stream", "X-Workbench-CSRF": csrf},
            )
            assert ligand_upload.status == 201
            page.get_by_role("radiogroup", name="选择分子或已有姿势", exact=True).get_by_role(
                "radio", name="上传或选择文件", exact=True
            ).check()
            ligand_choice = page.get_by_role("combobox", name="选择分子或已有姿势", exact=True)
            ligand_choice.focus()
            expect(
                ligand_choice.locator('option[value="' + ligand_upload.json()["id"] + '"]')
            ).to_have_count(1)
            ligand_choice.select_option(ligand_upload.json()["id"])
            page.get_by_role("button", name="下一步", exact=True).click()
            page.get_by_role("combobox", name="在哪里搜索？", exact=True).select_option("box")
            page.get_by_role("spinbutton", name="中心 X (Å)", exact=True).fill("1.5")
            page.get_by_role("spinbutton", name="中心 Y (Å)", exact=True).fill("2.5")
            page.get_by_role("spinbutton", name="中心 Z (Å)", exact=True).fill("3.5")
            page.get_by_text("在三维预览中点选搜索中心", exact=True).click()
            expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(timeout=30000)
            page.get_by_text("从列表选择残基", exact=True).click()
            active_panel = page.locator(
                ".questionnaire:visible > fieldset:not([hidden])"
            ).bounding_box()
            footer = page.locator(".questionnaire:visible > .questionnaire-actions").bounding_box()
            assert active_panel and footer
            assert footer["y"] >= active_panel["y"] + active_panel["height"] - 1
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            page.get_by_role("button", name="以所选原子为搜索中心", exact=True).click()
            for axis, value in zip("XYZ", ("1", "2", "3"), strict=True):
                expect(
                    page.get_by_role("spinbutton", name=f"中心 {axis} (Å)", exact=True)
                ).to_have_value(value)
            page.get_by_role("button", name="下一步", exact=True).click()
            expect(page.get_by_role("combobox", name="运行方案", exact=True)).to_have_value("cpu")
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("expert")
            page.get_by_role("checkbox", name="使用服务器 GPU", exact=True).check()
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("cpu")
            expect(page.get_by_role("checkbox", name="使用服务器 GPU", exact=True)).to_have_count(0)
            page.get_by_text("保存与复用任务条件（可选）", exact=True).click()
            page.get_by_role("combobox", name="计算结束后检查什么？", exact=True).select_option(
                "heavy_atom_centroid"
            )
            page.get_by_role("button", name="保存当前条件", exact=True).click()
            expect(page.get_by_role("button", name="应用所选条件", exact=True)).to_be_enabled()
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件与任务匹配", exact=True)).to_be_visible()
            page.get_by_role("button", name="上一步", exact=True).click()
            page.get_by_role("spinbutton", name="中心 X (Å)", exact=True).fill("9")
            page.get_by_role("button", name="下一步", exact=True).click()
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件不能用于当前任务", exact=True)).to_be_visible()
            page.get_by_role("button", name="应用所选条件", exact=True).click()
            page.get_by_role("button", name="上一步", exact=True).click()
            expect(page.get_by_role("spinbutton", name="中心 X (Å)", exact=True)).to_have_value("1")
            page.get_by_role("button", name="下一步", exact=True).click()
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件与任务匹配", exact=True)).to_be_visible()
            saved_conditions = page.request.get(base + "/api/research/constraints").json()
            assert saved_conditions
            assert saved_conditions[0]["body"]["conditions"][1]["kind"] == "spatial_bounds"
            assert saved_conditions[0]["body"]["conditions"][1]["tolerance_angstrom"] == 0.001
            expect(page.get_by_text("仅结果检查", exact=False)).to_be_visible()
            page.get_by_role("button", name="上一步", exact=True).click()
            centers = page.locator('.operation-grid label:has(input[type="number"])').evaluate_all(
                "labels=>labels.map(l=>({left:l.getBoundingClientRect().left,top:l.getBoundingClientRect().top}))"
            )
            assert len(centers) == 6
            assert abs(centers[0]["top"] - centers[2]["top"]) < 3
            assert centers[2]["left"] > centers[0]["left"] + 100
            page.get_by_role("button", name="下一步", exact=True).click()
            # A visited-step shortcut must recheck retained native range validity.
            page.get_by_role("button", name="下一步", exact=True).click()
            expect(page.get_by_role("button", name="探索结合模式", exact=True)).to_be_disabled()
            page.get_by_role("button", name="上一步", exact=True).click()
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("expert")
            page.get_by_role("spinbutton", name="CPU 线程", exact=True).fill("0")
            page.get_by_role("button", name="上一步", exact=True).click()
            page.get_by_role("button", name="步骤 4: 确认启动", exact=True).click()
            expect(page.get_by_role("heading", name="3. 选择方案", exact=True)).to_be_visible()
            expect(page.get_by_role("spinbutton", name="CPU 线程", exact=True)).to_have_value("0")
            page.get_by_role("spinbutton", name="CPU 线程", exact=True).fill("4")
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("cpu")
            for width in (390, 1440):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth + 1"
                )
                page.get_by_text(
                    "保存与复用任务条件（可选）", exact=True
                ).scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / f"binding-pose-input-{width}.png"))
            assert page.request.get(base + "/api/jobs").json() == []
            assert errors == []
        finally:
            browser.close()


def test_actual_rdkit_qualification_is_readable_and_only_qualified_candidates_reuse(tmp_path):
    """Actual verifier artifacts through a real DB/API/browser, without model sampling."""
    import hashlib
    import json
    import shutil
    import socket
    import subprocess
    import sys
    import time
    from urllib.request import urlopen
    from uuid import uuid4

    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"])
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    initial = assets.save(
        "actual-verifier-initial.sdf", "ligand", (fixture / "initial.sdf").read_bytes()
    )
    protein = assets.save(
        "controlled-protocol-receptor.pdb", "structure", b"controlled protocol fixture\n"
    )
    ref = {"asset_id": initial.id, "sha256": initial.sha256, "record": 0, "conformer": 0}
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "diffsbdd",
            "name": "真实 RDKit 复核夹具（未运行扩散模型）",
            "payload": {
                "mode": "inpaint",
                "protein": {"asset_id": protein.id, "sha256": protein.sha256},
                "initial": ref,
                "pocket": {"kind": "ligand", "ligand": ref},
                "options": {"task": "inpaint", "fragment_policy": "all", "fixed_atoms": [0, 1, 2]},
                "fixed_atoms": [{"molecule": ref, "index": i} for i in [0, 1, 2]],
            },
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    assert store.claim(expected_id=job.id).id == job.id
    store.finish(job.id, Status.SUCCEEDED)
    assert store.get(job.id).status == Status.SUCCEEDED
    output = state / "jobs" / job.id / "output"
    (output / "native").mkdir(parents=True)
    report = json.loads((fixture / "verification.json").read_text())
    report["source"] = request.payload.initial.model_dump(mode="json")
    for name in (report["raw_artifact"], report["qualified_artifact"], "diagnostic-core-002.sdf"):
        shutil.copyfile(fixture / name, output / name)
    result = {
        "operation": "diffsbdd",
        "complete": True,
        "mode": "inpaint",
        "valid": 1,
        "native_valid": 2,
        "attempted": 2,
        "molecule_artifact": report["qualified_artifact"],
        "core_verification": report,
        "notes": "Controlled real RDKit verification fixture; no diffusion-model sampling.",
    }
    (output / "result.json").write_text(json.dumps(result))
    assert (
        hashlib.sha256((output / report["qualified_artifact"]).read_bytes()).hexdigest()
        == report["qualified_sha256"]
    )
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": f"http://127.0.0.1:{port}",
    }
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with (evidence / "fixed-core-service.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(40):
                try:
                    with urlopen(base + "/api/health", timeout=2) as response:
                        assert json.load(response)["worker_ready"]
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise AssertionError("Controlled verifier browser service did not start")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                try:
                    page.goto(base + "/#task=" + job.id)
                    summaries = page.get_by_text("固定区域独立复核", exact=False)
                    expect(summaries).to_have_count(1)
                    summaries.click()
                    expect(page.get_by_text("候选 1 · 通过", exact=True)).to_be_visible()
                    expect(page.get_by_text("候选 2 · 违反要求", exact=True)).to_be_visible()
                    page.get_by_text("查看已验证原子映射", exact=True).click()
                    expect(page.get_by_text("0 → 1; 1 → 2; 2 → 0", exact=True)).to_be_visible()
                    candidates = page.get_by_role(
                        "button", name="候选 1 · 固定区域检查通过", exact=True
                    )
                    expect(candidates).to_have_count(1)
                    candidates.click()
                    expect(
                        page.get_by_role("button", name="计算这个候选的性质", exact=True)
                    ).to_be_visible()
                    page.get_by_text("检查诊断结构", exact=True).click()
                    expect(
                        page.get_by_role("link", name="下载诊断 SDF", exact=True)
                    ).to_be_visible()
                    expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                        timeout=30000
                    )
                    expect(
                        page.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                    ).to_be_visible(timeout=30000)
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        )
                        page.screenshot(
                            path=str(evidence / f"actual-fixed-core-{width}.png"), full_page=True
                        )
                    actual = page.request.get(
                        base + f"/api/research/objects?source_job={job.id}"
                    ).json()
                    assert len([o for o in actual if o["kind"] == "molecule"]) == 1
                    assert len(page.request.get(base + "/api/jobs").json()) == 1
                    # The displayed proof must also fail closed when its molecular
                    # bundle is corrupted after indexing; no native inference runs.
                    (output / report["qualified_artifact"]).write_text("changed")
                    invalid = page.request.get(base + f"/api/jobs/{job.id}/result")
                    assert invalid.status == 422
                    assert "invalid or changed" in invalid.json()["detail"]
                    assert not errors
                except Exception:
                    page.screenshot(path=str(evidence / "fixed-core-failure.png"), full_page=True)
                    (evidence / "fixed-core-failure.html").write_text(
                        page.content(), encoding="utf-8"
                    )
                    raise
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)


def test_actual_prepared_state_collection_can_be_reviewed_and_reused_without_computing(tmp_path):
    import json
    import shutil
    import socket
    import subprocess
    import sys
    import time
    from urllib.request import urlopen
    from uuid import uuid4

    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "molecular-states"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    source = assets.save("actual-state-source.sdf", "ligand", (fixture / "input.sdf").read_bytes())
    result = json.loads((fixture / "result.json").read_text())
    result["source"] = {
        "asset_id": source.id,
        "sha256": source.sha256,
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "molecular_states",
            "name": "实际原生化学状态与构象结果",
            "molecule": result["source"],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    assert store.claim(expected_id=job.id).id == job.id
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for name in (
        result["state_artifact"],
        result["conformer_artifact"],
        *(c["artifact"] for c in result["conformers"]),
    ):
        shutil.copyfile(fixture / name, output / name)
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    evidence = Path("server_tests/evidence")
    with (evidence / "state-collection-browser.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(40):
                try:
                    with urlopen(base + "/api/health", timeout=2) as response:
                        assert json.load(response)["worker_ready"]
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise AssertionError("State collection browser service did not start")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base + "/#task=" + job.id)
                    expect(
                        page.get_by_role("region", name="分子状态与构象结果", exact=True)
                    ).to_be_visible()
                    page.get_by_text("状态 1 · 电荷 0 · C2H6O", exact=True).click()
                    button = page.get_by_role("button", name="构象 1", exact=False)
                    expect(button).to_have_count(1)
                    button.click()
                    expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                        timeout=30000
                    )
                    expect(
                        page.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                    ).to_be_visible(timeout=30000)
                    page.get_by_role("button", name="用于寻找结合姿势", exact=True).click()
                    expect(
                        page.get_by_role(
                            "combobox", name="选择分子或已有姿势 · 复用研究资产", exact=True
                        )
                    ).not_to_have_value("")
                    expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        )
                        page.screenshot(
                            path=str(evidence / f"prepared-state-reuse-{width}.png"), full_page=True
                        )
                    assert len(page.request.get(base + "/api/jobs").json()) == 1
                    assert not errors
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)


def test_all_task_entries_show_one_step_and_no_early_dispatch():
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(base)
            before = len(page.request.get(base + "/api/jobs").json())
            names = [
                "计算小分子性质",
                "抗体设计与 CDR 优化",
                "蛋白序列评分",
                "ESM2 引导序列提案",
                "结构引导序列设计",
                "抗体候选折叠与评分",
                "表位与热点接触",
                "复合物相互作用分析",
                "对齐目标后比较结合姿势",
                "候选进化树",
                "比较两个候选集",
                "按蛋白序列检索",
                "按蛋白结构检索",
                "准备抗体设计靶标 MSA",
                "准备 MSA 与模板",
                "导入结构与批量任务",
                "模型、数据库与环境检查",
                "口袋条件分子生成",
                "局部重设计",
                "分子多样化",
                "分子优化",
                "口袋检查",
                "准备受体结构",
                "分子相互作用",
                "候选描述符",
                "候选导出",
                "研究计划与连续任务",
                "定义完整分子的区域",
                "发现多个候选口袋",
                "探索分子结合模式",
                "评估已有结合姿势",
                "局部最小化结合姿势",
                "准备分子状态与构象",
                "对齐多个受体构象",
                "性质与早期安全性预测",
                "抗体人源参考与框架优化",
            ]
            for name in names:
                page.get_by_role("navigation", name="主导航").get_by_role(
                    "button", name="全部能力", exact=True
                ).click()
                page.get_by_role("button", name=name, exact=True).click()
                expect(
                    page.locator(".questionnaire:visible > fieldset:not([hidden])")
                ).to_have_count(1)
                next_button = page.get_by_role("button", name="下一步", exact=True)
                expect(next_button).to_be_visible()
                expect(page.locator(".questionnaire:visible button[type=submit]")).to_have_count(0)
                for width in (390, 1440):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    actions = page.locator(
                        ".questionnaire:visible > .questionnaire-actions"
                    ).bounding_box()
                    button = next_button.bounding_box()
                    assert actions and button
                    assert abs(button["x"] + button["width"] - actions["x"] - actions["width"]) < 3
                    page.screenshot(
                        path=f"server_tests/evidence/task-entry-{names.index(name):02d}-{width}.png",
                        full_page=True,
                    )
                assert len(page.request.get(base + "/api/jobs").json()) == before
            assert not errors
        finally:
            browser.close()
