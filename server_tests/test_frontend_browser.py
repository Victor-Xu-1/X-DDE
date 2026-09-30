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
            page.get_by_role("button", name="研究资产", exact=True).click()
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
            assert set(health["engines"]) == {"opendde", "diffsbdd", "harness", "p2rank", "gnina"}
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
                expect(page.get_by_role("button", name="创建任务", exact=True)).to_be_disabled()
                if title == "局部重设计":
                    hint = page.get_by_text(
                        "固定区域会独立复核；违反要求或无法确认的候选不会自动复用。", exact=True
                    )
                    expect(hint).to_be_visible()
                    assert "0.5 Å" in hint.get_attribute("title")
                if title in ["口袋条件分子生成", "局部重设计", "分子多样化", "分子优化"]:
                    model = page.get_by_role("combobox", name="使用哪个模型？", exact=True)
                    assert model.locator("option").count() == (
                        8 if title == "口袋条件分子生成" else 4
                    )
                    page.get_by_role("button", name="专家微调", exact=True).click()
                    expect(
                        page.get_by_role(
                            "textbox", name="全部原生参数（服务器逐项校验）", exact=True
                        )
                    ).to_be_visible()
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
            page.get_by_role("combobox", name="打开已保存计划", exact=True).select_option(
                target["id"]
            )
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
            picker = page.get_by_role("combobox", name="1. 选择 PDB 受体", exact=True)
            picker.focus()
            expect(picker.locator('option[value="' + asset["id"] + '"]')).to_have_count(1)
            picker.select_option(asset["id"])
            expect(page.get_by_role("heading", name="三维结构与口袋", exact=False)).to_be_visible()
            page.get_by_text("从列表选择残基", exact=True).click()
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            chosen = page.get_by_role("textbox", name="已选残基（也可输入 A:10, A:11）", exact=True)
            expect(chosen).to_have_value("A:10")
            page.get_by_role("button", name="A:GLY11", exact=True).click()
            expect(chosen).to_have_value("A:10, A:11")
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            expect(chosen).to_have_value("A:11")
            page.get_by_role("button", name="创建任务", exact=True).is_disabled()
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
            assert labels[:7] == [
                "结构预测",
                "口袋寻找",
                "结合模式",
                "分子生成",
                "抗体设计",
                "性质计算",
                "分子编辑",
            ]
            for label, heading in (
                ("口袋寻找", "发现多个候选口袋"),
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
            expect(page.get_by_role("button", name="探索结合模式", exact=True)).to_be_disabled()
            expect(page.get_by_role("combobox", name="运行方案", exact=True)).to_have_value("cpu")
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("expert")
            page.get_by_role("checkbox", name="使用服务器 GPU", exact=True).check()
            page.get_by_role("combobox", name="运行方案", exact=True).select_option("cpu")
            expect(page.get_by_role("checkbox", name="使用服务器 GPU", exact=True)).to_have_count(0)
            page.get_by_role("combobox", name="在哪里搜索？", exact=True).select_option("box")
            page.get_by_role("spinbutton", name="中心 X (Å)", exact=True).fill("1.5")
            page.get_by_role("spinbutton", name="中心 Y (Å)", exact=True).fill("2.5")
            page.get_by_role("spinbutton", name="中心 Z (Å)", exact=True).fill("3.5")
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
            receptor = page.get_by_role("combobox", name="受体结构", exact=True)
            receptor.focus()
            expect(receptor.locator('option[value="' + asset["id"] + '"]')).to_have_count(1)
            receptor.select_option(asset["id"])
            page.get_by_text("在三维预览中点选搜索中心", exact=True).click()
            expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(timeout=30000)
            page.get_by_text("从列表选择残基", exact=True).click()
            page.get_by_role("button", name="A:ALA10", exact=True).click()
            page.get_by_role("button", name="以所选原子为搜索中心", exact=True).click()
            for axis, value in zip("XYZ", ("1", "2", "3"), strict=True):
                expect(
                    page.get_by_role("spinbutton", name=f"中心 {axis} (Å)", exact=True)
                ).to_have_value(value)
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
            ligand_choice = page.get_by_role("combobox", name="选择分子或已有姿势", exact=True)
            ligand_choice.focus()
            expect(
                ligand_choice.locator('option[value="' + ligand_upload.json()["id"] + '"]')
            ).to_have_count(1)
            ligand_choice.select_option(ligand_upload.json()["id"])
            page.get_by_text("保存与复用任务条件（可选）", exact=True).click()
            page.get_by_role("combobox", name="计算结束后检查什么？", exact=True).select_option(
                "heavy_atom_centroid"
            )
            page.get_by_role("button", name="保存当前条件", exact=True).click()
            expect(page.get_by_role("button", name="应用所选条件", exact=True)).to_be_enabled()
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件与任务匹配", exact=True)).to_be_visible()
            page.get_by_role("spinbutton", name="中心 X (Å)", exact=True).fill("9")
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件不能用于当前任务", exact=True)).to_be_visible()
            page.get_by_role("button", name="应用所选条件", exact=True).click()
            expect(page.get_by_role("spinbutton", name="中心 X (Å)", exact=True)).to_have_value("1")
            page.get_by_role("button", name="检查引擎支持", exact=True).click()
            expect(page.get_by_text("条件与任务匹配", exact=True)).to_be_visible()
            saved_conditions = page.request.get(base + "/api/research/constraints").json()
            assert saved_conditions
            assert saved_conditions[0]["body"]["conditions"][1]["kind"] == "spatial_bounds"
            assert saved_conditions[0]["body"]["conditions"][1]["tolerance_angstrom"] == 0.001
            expect(page.get_by_text("仅结果检查", exact=False)).to_be_visible()
            centers = page.locator('.operation-grid label:has(input[type="number"])').evaluate_all(
                "labels=>labels.map(l=>({left:l.getBoundingClientRect().left,top:l.getBoundingClientRect().top}))"
            )
            assert len(centers) == 6
            assert abs(centers[0]["top"] - centers[2]["top"]) < 3
            assert centers[2]["left"] > centers[0]["left"] + 100
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
