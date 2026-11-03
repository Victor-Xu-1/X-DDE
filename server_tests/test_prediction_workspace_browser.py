"""Compiled prediction pages and real WebGL/Plotly; controlled fixtures, no inference."""

import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.prediction_workspace_case import INPUTS, case


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_prediction_workspace_selection_maps_and_responsive_input(tmp_path, language, width):
    evidence = Path("outputs/prediction-workspace") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, sequence = case(state)
    errors, submissions = [], []
    zh = language == "zh"
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
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
        page.get_by_role("button", name="构象 1" if zh else "Sample 1", exact=True).click()
        download = strip.get_by_role("link")
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
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(evidence / "result.png"), full_page=True)
        page.goto(base + "/#view=new&tool=mol1.predict")
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
        assert not errors and not submissions, (errors, submissions)
        assert len(page.request.get(base + "/api/jobs").json()) == 1
        browser.close()
