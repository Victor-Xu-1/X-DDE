"""Compiled prediction pages and real WebGL/Plotly; controlled fixtures, no inference."""

import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.fullscreen_browser_helpers import inspect_full_workspace
from server_tests.prediction_workspace_case import INPUTS, case


def check_prediction_setup_layout(page, width):
    picker = page.locator(".module-task-picker:visible")
    expect(picker).to_be_visible()
    for side in ("top", "right", "bottom", "left"):
        expect(picker).to_have_css(f"border-{side}-width", "0px")
    expect(picker).to_have_css("border-top-left-radius", "0px")
    form = page.locator(".prediction-form-body:visible")
    review = page.locator(".prediction-setup:visible")
    expect(review).to_be_visible()
    preview = review.locator(".prediction-preview-open").bounding_box()
    assert preview and preview["height"] >= 42
    form_box, review_box = form.bounding_box(), review.bounding_box()
    assert form_box and review_box
    if width > 1000:
        assert review_box["x"] >= form_box["x"] + form_box["width"] + 20
        assert abs(review_box["y"] - form_box["y"]) <= 1
        expect(review).to_have_css("position", "sticky")
        header = page.locator(".studio-topbar").bounding_box()
        offset = review.evaluate("node => parseFloat(getComputedStyle(node).top)")
        assert header and offset >= header["height"] + 8
    else:
        expect(review).to_have_css("position", "static")
        assert review_box["y"] >= form_box["y"] + form_box["height"]
        steps = form.locator(".questionnaire-steps button").evaluate_all("""buttons =>
            buttons.map(button => {
                const box = button.getBoundingClientRect();
                return {top: Math.round(box.top), height: box.height};
            })
        """)
        assert len(steps) >= 4 and len({step["top"] for step in steps}) == 1
        assert min(step["height"] for step in steps) >= 44
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")

    if width >= 1800:
        content = page.locator("main.studio-content").bounding_box()
        assert content and content["width"] <= 1400, "Input reading width must return after results"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390), ("en", 2560)])
def test_prediction_workspace_selection_maps_and_responsive_input(tmp_path, language, width):
    evidence = Path("outputs/prediction-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, sequence = case(state)
    errors, submissions = [], []
    zh = language == "zh"
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(
            viewport={"width": width, "height": 1000},
            screen={"width": width, "height": 1000},
        )
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base + "/#task=" + identifier)
        strip = page.get_by_role("region", name="构象与置信度" if zh else "Sample and confidence")
        expect(strip).to_be_visible(timeout=30000)
        frame_title = "可交互分子结构" if zh else "Interactive molecular structure"
        scene = page.frame_locator(f'iframe[title="{frame_title}"]')
        expect(scene.locator("canvas")).to_be_visible(timeout=30000)
        plot = page.locator(".confidence-panel .research-plot").first
        expect(plot.get_by_role("application")).to_have_attribute(
            "aria-busy", "false", timeout=30000
        )
        metric = page.get_by_role("combobox", name="置信度视图" if zh else "Confidence view")
        for value in ("pde", "contacts", "pae"):
            metric.select_option(value)
            expect(plot.get_by_role("application")).to_have_attribute(
                "aria-busy", "false", timeout=30000
            )
        expect(
            page.get_by_role("button", name="构象 1" if zh else "Sample 1", exact=True)
        ).to_have_attribute("aria-pressed", "true")
        page.get_by_role("button", name="构象 0" if zh else "Sample 0", exact=True).click()
        expect(strip).to_contain_text("80.0")
        expect(
            page.get_by_role("button", name="构象 0" if zh else "Sample 0", exact=True)
        ).to_have_attribute("aria-pressed", "true")
        seed = strip.get_by_role("combobox", name="选择随机种子" if zh else "Select seed")
        expect(seed).to_contain_text("101 · 0.50")
        for sample in (0, 1):
            name = f"叠加 种子 101 · 构象 {sample}" if zh else f"Overlay Seed 101 · Sample {sample}"
            page.get_by_role("checkbox", name=name, exact=True).check()
        expect(strip.get_by_role("status")).to_have_text(
            "正在叠加 2 个构象" if zh else "Overlaying 2 samples"
        )
        model_download = strip.get_by_role("button", name="下载此构象 ↓" if zh else "This model ↓")
        expect(model_download).to_have_count(0)
        expect(plot).to_have_count(0)
        page.get_by_role(
            "button", name="种子 101 · 构象 0" if zh else "Seed 101 · Sample 0", exact=True
        ).click()
        expect(strip).to_contain_text("80.0")
        expect(strip.get_by_role("status")).to_have_count(0)
        page.get_by_role("button", name="构象 1" if zh else "Sample 1", exact=True).click()
        # This fixture intentionally has no source checksum.
        with page.expect_response(lambda reply: "/prediction-sample.zip?" in reply.url) as package:
            strip.get_by_role("button", name="下载此构象 ↓" if zh else "This model ↓").click()
        assert package.value.status == 409
        assert package.value.json()["detail"]["code"] == "legacy_unsealed_structure"
        download = strip.get_by_role(
            "link", name="下载原始 CIF" if zh else "Download original CIF"
        )
        expect(download).to_have_attribute(
            "href", f"/api/jobs/{identifier}/download?name=reference_sample_1.cif"
        )
        expect(strip).to_contain_text("81.0")
        expect(plot.get_by_role("application")).to_have_attribute(
            "aria-busy", "false", timeout=30000
        )
        with page.expect_download() as transfer:
            download.click()
        path = evidence / "selected-model.cif"
        transfer.value.save_as(path)
        assert (
            hashlib.sha256(path.read_bytes()).digest()
            == hashlib.sha256((INPUTS / "9BIG.cif").read_bytes()).digest()
        )
        sequence_view = page.get_by_role(
            "region", name="结构中的残基" if zh else "Residues in structure"
        )
        expect(sequence_view).to_be_visible()
        native_residues = sequence_view.get_by_role("checkbox")
        assert native_residues.count() > 100
        first, second = native_residues.nth(0), native_residues.nth(1)
        first.click()
        expect(first).to_have_attribute("aria-checked", "true")
        second.click(modifiers=["Shift"])
        expect(sequence_view.get_by_role("status")).to_contain_text("2 ")
        first.click(modifiers=["Control"])
        expect(first).to_have_attribute("aria-checked", "false")
        expect(second).to_have_attribute("aria-checked", "true")
        sequence_view.get_by_role(
            "button", name="清除选择" if zh else "Clear sequence selection", exact=True
        ).click()
        expect(second).to_have_attribute("aria-checked", "false")
        for name in ("全部原子" if zh else "All atoms", "侧链" if zh else "Side chains"):
            toggle = page.get_by_role("switch", name=name, exact=True)
            toggle.click()
            expect(toggle).to_be_checked()
            expect(
                page.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
            ).to_be_enabled()
            toggle.click()
            expect(toggle).not_to_be_checked()
        page.locator(".viewer-chain-menu > summary").click()
        visibility = page.get_by_role("group", name="链显示" if zh else "Chain visibility")
        menu = visibility.bounding_box()
        assert menu and menu["x"] >= 0 and menu["x"] + menu["width"] <= width + 1
        visibility.get_by_role(
            "checkbox", name="显示链 A" if zh else "Show chain A", exact=True
        ).click()
        expect(visibility.get_by_role("checkbox").first).not_to_be_checked()
        expect(page.locator(".viewer-chain-menu > summary")).to_contain_text("0 / 1")
        expect(first).to_be_disabled()
        expect(sequence_view.get_by_role("status")).to_contain_text("0 ")
        visibility.get_by_role(
            "button", name="显示全部链" if zh else "Show all chains", exact=True
        ).click()
        expect(visibility.get_by_role("checkbox").first).to_be_checked()
        visibility.get_by_role(
            "button", name="只显示链 A" if zh else "Show only chain A", exact=True
        ).click()
        expect(visibility.get_by_role("checkbox").first).to_be_checked()
        page.locator(".viewer-chain-menu > summary").click()
        preview = page.locator(".prediction-result .structure-workbench-view")
        inspector = page.locator(".prediction-result .structure-workbench-details")
        a, b = preview.bounding_box(), inspector.bounding_box()
        assert a and b
        if width > 1000:
            assert a["x"] < b["x"] and a["width"] > b["width"] and abs(a["y"] - b["y"]) < 2
        else:
            assert a["y"] < b["y"]
            menu = page.locator(".mobile-navigation-trigger").bounding_box()
            title = page.locator(".studio-topbar .page-context-title").bounding_box()
            assert menu and title and title["x"] >= menu["x"] + menu["width"] + 8
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        matrix = plot.locator(".hm image").bounding_box()
        assert matrix and abs(matrix["width"] - matrix["height"]) <= 2
        if width >= 1800:
            available = page.locator(".studio-main").bounding_box()
            content = page.locator("main.studio-content").bounding_box()
            stage = preview.locator(".molecular-stage").bounding_box()
            assert available and content and stage
            assert content["width"] >= available["width"] - 1
            assert a["x"] - available["x"] <= 40
            assert stage["width"] >= 1000 and stage["height"] >= 600

            def check_expanded_height():
                expanded = preview.locator(".molecular-stage").bounding_box()
                height = page.evaluate("innerHeight")
                assert expanded and expanded["height"] >= max(360, height - 220)

            inspect_full_workspace(
                page, preview, evidence, language, "wide-prediction", check_expanded_height
            )
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=str(evidence / "result-viewport.png"), full_page=False)
        page.screenshot(path=str(evidence / "result.png"), full_page=True)
        page.goto(base + "/#view=new&tool=mol1.predict")
        check_prediction_setup_layout(page, width)
        page.get_by_role(
            "textbox",
            name="单字母氨基酸序列" if zh else "One-letter amino-acid sequence",
            exact=True,
        ).fill(sequence)
        page.get_by_role(
            "textbox",
            name="SMILES 或 CCD_ 编号" if zh else "SMILES or CCD_ identifier",
            exact=True,
        ).fill("CCD_ATP")
        summary = page.get_by_role("complementary", name="研究设置概览" if zh else "Study setup")
        expect(summary).to_contain_text("输入可继续检查与确认" if zh else "Inputs ready to review")
        summary.get_by_label("蛋白质 材料 1" if zh else "Protein input 1", exact=True).click()
        expect(summary.locator("pre").first).to_have_text(sequence)
        page.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        page.wait_for_function("""() => {
            const heading = document.activeElement;
            const toolbar = document.querySelector('.studio-topbar');
            return heading?.classList.contains('questionnaire-heading') && toolbar &&
              heading.getBoundingClientRect().top >= toolbar.getBoundingClientRect().bottom + 8;
        }""")
        expect(page.locator(".questionnaire:visible > fieldset:not([hidden])")).to_have_count(1)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(evidence / "supporting-inputs.png"), full_page=True)
        if width <= 960:
            page.get_by_role(
                "button",
                name="打开研究导航" if zh else "Open research navigation",
                exact=True,
            ).click()
        page.get_by_role(
            "button", name="结构预测" if zh else "Structure prediction", exact=True
        ).click()
        check_prediction_setup_layout(page, width)
        page.screenshot(path=str(evidence / "prediction-new-task.png"), full_page=True)
        assert not errors and not submissions, (errors, submissions)
        assert len(page.request.get(base + "/api/jobs").json()) == 1
        browser.close()
