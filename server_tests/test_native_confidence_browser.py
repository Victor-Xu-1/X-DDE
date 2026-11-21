"""Retained native scores, actual Plotly geometry and downloads; no inference."""

import hashlib
import json
import os
import re
import statistics
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.confidence import confidence_view
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.native_confidence_case import native_case
from server_tests.publication_browser_helpers import export_figure, inspect_png


@pytest.mark.parametrize("language,theme,width,height", [
    ("en", "warm", 1440, 900), ("en", "light", 1280, 650), ("zh", "dark", 390, 900),
])
def test_retained_atom_confidence_uses_native_fraction_scale(
    tmp_path, language, theme, width, height
):
    evidence = Path("outputs/native-confidence") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, selected = native_case(state, os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    output = state / "jobs" / identifier / "output"
    data = confidence_view(output, selected["artifact"], "pae")
    native = output / data["native_artifact"]
    original = native.read_bytes()
    raw = json.loads(original)
    assert data["atom_plddt_unit"] == "0-1"
    assert len(raw["atom_plddt"]) == 943 and data["token_count"] == 116
    assert abs(statistics.mean(raw["atom_plddt"]) * 100 - selected["plddt"]) <= 0.5
    assert data["binding"]["confidence_sha256"] == hashlib.sha256(original).hexdigest()
    assert (
        data["binding"]["structure_sha256"]
        == hashlib.sha256((output / selected["artifact"]).read_bytes()).hexdigest()
    )
    zh = language == "zh"
    errors, submissions = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            f"localStorage.setItem('x-dde-theme','{theme}')"
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base + "/#task=" + identifier)
        panel = page.locator(".confidence-panel")
        viewer = page.locator(".viewer-panel")
        expect(viewer.locator(".viewer-mode-options")).to_be_visible(timeout=30000)
        display = viewer.get_by_role("button", name="显示选项" if zh else "Display options")
        coloring = viewer.get_by_role("combobox", name="结构着色" if zh else "Structure coloring")

        def show_coloring():
            if display.is_visible() and display.get_attribute("aria-expanded") == "false":
                display.click()
            return coloring

        expect(show_coloring()).to_have_value("confidence", timeout=30000)
        sequence = page.get_by_role(
            "region", name="结构中的残基" if zh else "Residues in structure"
        )
        first = sequence.get_by_role("checkbox", name=re.compile(r"^A:TRP1 · pLDDT "))
        expect(first).to_be_visible()
        host = page.locator(".structure-workbench > .structure-workbench-sequence")
        expect(host.locator(".structure-sequence")).to_have_count(1)
        expect(page.locator(".viewer-panel .structure-sequence")).to_have_count(0)
        workspace = page.locator(".structure-workbench")
        sequence_bounds = sequence.bounding_box()
        workspace_bounds = workspace.bounding_box()
        preview_bounds = workspace.locator(".structure-workbench-view").bounding_box()
        details_bounds = workspace.locator(".structure-workbench-details").bounding_box()
        assert sequence_bounds and workspace_bounds and preview_bounds and details_bounds
        stage = page.locator('.molecular-stage iframe').bounding_box()
        assert stage and stage["height"] >= min(300, height * .4)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        if width > 1000:
            page.wait_for_function("""() => {
                const p=document.querySelector('.structure-workbench-details');
                const c=p?.querySelector('.research-plot-canvas');
                return c && c.getAttribute('aria-busy') === 'false' &&
                    c.getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom + 2;
            }""")
            assert abs(sequence_bounds["width"] - details_bounds["width"]) < 2
            assert abs(sequence_bounds["x"] - details_bounds["x"]) < 2
            assert sequence_bounds["y"] >= details_bounds["y"] + details_bounds["height"] - 2
            assert preview_bounds["width"] > details_bounds["width"]
            if height >= 800:
                assert stage["y"] < height * .5
                assert stage["y"] + stage["height"] <= height + 32
            else:
                # Short windows scroll the document instead of clipping a legible matrix.
                assert preview_bounds["height"] >= 400
            assert page.locator('.prediction-sample-bar').bounding_box()["height"] <= 80
        else:
            assert abs(sequence_bounds["width"] - workspace_bounds["width"]) < 2
            assert sequence_bounds["y"] >= max(
                preview_bounds["y"] + preview_bounds["height"],
                details_bounds["y"] + details_bounds["height"],
            )
        expected_first = statistics.mean(
            value * 100
            for i, value in enumerate(raw["atom_plddt"])
            if raw["atom_to_token_idx"][i] == 0
        )
        assert f"{expected_first:.1f}" in first.get_attribute("aria-label")
        first.click()
        expect(first).to_have_attribute("aria-checked", "true")
        matrix = panel.locator(".research-plot").first
        view_bounds = page.locator(".structure-workbench-view").bounding_box()
        panel_bounds = panel.bounding_box()
        assert view_bounds and panel_bounds
        if width >= 1000:
            assert abs(view_bounds["y"] - panel_bounds["y"]) < 2
            assert panel_bounds["x"] >= view_bounds["x"] + view_bounds["width"]
        else:
            assert panel_bounds["y"] >= view_bounds["y"] + view_bounds["height"]
        expect(matrix.locator(".shapelayer path")).to_have_count(2)
        show_coloring().select_option("chain")
        expect(first).to_have_attribute("aria-checked", "true")
        show_coloring().select_option("confidence")
        sequence.screenshot(path=str(evidence / "linked-sequence.png"))
        iframe = viewer.locator("iframe").element_handle()
        viewer.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace"
        ).click()
        expect(
            page.locator(".structure-workbench[data-workspace-expanded] .structure-sequence")
        ).to_be_visible()
        expect(first).to_have_attribute("aria-checked", "true")
        sequence.screenshot(path=evidence / "fullscreen-sequence.png")
        page.keyboard.press("Escape")
        expect(page.locator(".structure-workbench[data-workspace-expanded]")).to_have_count(0)
        assert viewer.locator("iframe").evaluate("(node, original) => node === original", iframe)
        expect(first).to_have_attribute("aria-checked", "true")
        page.locator(".viewer-panel").screenshot(path=str(evidence / "confidence-structure.png"))
        page.get_by_role("button", name="清除选择" if zh else "Clear sequence selection").click()
        expect(first).to_have_attribute("aria-checked", "false")
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        matrix.scroll_into_view_if_needed()
        # Aspect-ratio letterboxing belongs to the axes, not to the native matrix.
        hit = matrix.locator(".heatmaplayer image").bounding_box()
        assert hit
        column = 0 if height >= 800 else 57
        clicked = first if column == 0 else sequence.get_by_role(
            "checkbox", name=re.compile(r"^A:ALA58 · pLDDT ")
        )
        (evidence / "matrix-hit.json").write_text(json.dumps({
            "data_image": hit,
            "drag_area": matrix.locator(".nsewdrag").bounding_box(),
            "native_column": column,
            "expected_residue": clicked.get_attribute("aria-label"),
        }))
        page.mouse.click(
            hit["x"] + hit["width"] * (column + .5) / len(data["indices"]),
            hit["y"] + hit["height"] * .5,
        )
        expect(clicked).to_have_attribute("aria-checked", "true")
        matrix.get_by_role(
            "combobox", name="图表操作" if zh else "Chart interaction"
        ).select_option("select")
        page.wait_for_function("""() => {
            const plot = document.querySelector('.confidence-panel .research-plot-canvas');
            return plot?.layout?.dragmode === 'select';
        }""")
        expect(matrix.get_by_role("application")).to_have_attribute("aria-busy", "false")
        matrix.get_by_role("application").scroll_into_view_if_needed()
        hit = matrix.locator(".heatmaplayer image").bounding_box()
        assert hit
        start = {"x": hit["x"] + hit["width"] * .15, "y": hit["y"] + hit["height"] * .25}
        end = {"x": hit["x"] + hit["width"] * .55, "y": hit["y"] + hit["height"] * .65}
        drag_state = page.evaluate("""({start, end}) => {
            const plot = document.querySelector('.confidence-panel .research-plot-canvas');
            const hit = p => document.elementFromPoint(p.x, p.y)?.getAttribute('class');
            return {mode: plot?.layout?.dragmode, start, end,
                start_hit: hit(start), end_hit: hit(end), viewport: [innerWidth, innerHeight]};
        }""", {"start": start, "end": end})
        (evidence / "matrix-drag-state.json").write_text(json.dumps(drag_state))
        # Keep the gesture above the native drag threshold even in a short pane.
        page.mouse.move(**start)
        page.mouse.down()
        page.mouse.move(**end, steps=10)
        page.wait_for_function("""() => [...document.querySelectorAll('.select-outline')]
            .some(node => { const box = node.getBoundingClientRect();
                return box.width >= 20 && box.height >= 20; })""", timeout=5000)
        page.mouse.up()
        expect(sequence.get_by_role("checkbox", checked=True)).not_to_have_count(1)
        assert sequence.get_by_role("checkbox", checked=True).count() >= 40
        matrix.screenshot(path=str(evidence / "linked-pae.png"))
        panel.get_by_text("逐原子置信度" if zh else "Atom confidence", exact=True).click()
        plot = panel.locator(".research-plot").filter(
            has=page.get_by_role("heading", name="Atom pLDDT", exact=True)
        )
        page.screenshot(path=str(evidence / "atom-disclosure.png"), full_page=False)
        (evidence / "atom-disclosure-state.json").write_text(
            json.dumps(
                {
                    "disclosures": [
                        item.get_attribute("open") for item in panel.locator("details").all()
                    ],
                    "plots": panel.locator(".research-plot").count(),
                    "canvases": panel.locator(".research-plot-canvas").count(),
                }
            )
        )
        expect(plot.get_by_role("application")).to_have_attribute(
            "aria-busy", "false", timeout=30000
        )
        area = plot.locator(".nsewdrag").bounding_box()
        line = plot.locator(".scatterlayer .js-line").bounding_box()
        assert area and line
        # Native scores are 64–98%, not 0.64–0.98% near the bottom of a 0–100 axis.
        assert line["y"] + line["height"] < area["y"] + area["height"] * 0.5
        with page.expect_download() as transfer:
            panel.get_by_role(
                "link", name="下载完整原生置信度" if zh else "Download full native confidence"
            ).click()
        downloaded = evidence / "native-full-data.json"
        transfer.value.save_as(downloaded)
        assert downloaded.read_bytes() == original == native.read_bytes()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        plot.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / "atom-confidence.png"), full_page=False)
        (evidence / "source.json").write_text(
            json.dumps(
                {
                    "job": identifier,
                    "candidate": selected["id"],
                    "sha256": hashlib.sha256(original).hexdigest(),
                    "atom_unit": "0-1",
                    "display_unit": "0-100",
                    "no_inference": True,
                }
            )
        )
        assert not errors and not submissions, (errors, submissions)
        browser.close()


@pytest.fixture(scope="module")
def prediction_example_workspace(tmp_path_factory):
    root = tmp_path_factory.mktemp("prediction-example-workspace")
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("WB_HOME", str(root))
        patch.setenv("WB_STATE_DIR", str(root / "state"))
        settings = Settings.from_env()
        restored = restore_bundle(
            Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, SHA256
        )
        assert restored["computed"] > 0
        yield settings, Store(settings.state_dir / "jobs.sqlite3")


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_prediction_example_prioritizes_the_recorded_result_and_returns_to_setup(
    prediction_example_workspace, language, width
):
    settings, store = prediction_example_workspace
    evidence = Path("outputs/native-confidence") / f"example-{language}"
    evidence.mkdir(parents=True, exist_ok=True)
    before = {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []
        page.on("request", lambda r: writes.append(r.url) if r.method == "POST" else None)
        page.goto(base + "/#view=new&tool=predict")
        picker = page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        )
        expect(picker).to_be_visible()
        page.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
        result = page.get_by_role(
            "region", name="模板的真实结果" if zh else "Actual template result"
        )
        expect(result).to_be_visible(timeout=30000)
        guide = page.locator(".example-preview-toolbar .example-guide")
        guide.get_by_label("模板说明与来源" if zh else "Template guide & sources").click()
        expect(guide.locator(".example-result-source")).to_contain_text("OpenDDE")
        page.keyboard.press("Escape")
        expect(guide.locator(".example-result-source")).to_be_hidden()
        expect(picker).to_be_hidden()
        export = result.locator(".viewer-panel").get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓"
        )
        expect(export).to_be_enabled(timeout=30000)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        iframe = result.locator(".molecular-stage iframe").element_handle()
        result.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace"
        ).click()
        page.get_by_role("button", name="关闭展开视图" if zh else "Close expanded view").click()
        assert result.locator(".molecular-stage iframe").evaluate(
            "(node, original) => node === original", iframe
        )
        page.screenshot(path=evidence / "example-result.png")
        page.get_by_role(
            "button", name="返回任务填写" if zh else "Return to task form", exact=True
        ).click()
        expect(picker).to_be_visible()
        expect(page.get_by_role(
            "group", name="后端模型" if zh else "Backend method"
        )).to_be_visible()
        assert not writes
        assert before == {job.id: job.model_dump(mode="json") for job in store.list_jobs(1000)}
        browser.close()


@pytest.mark.parametrize(("width", "height", "language"), [
    (1001, 600, "en"), (1110, 580, "zh"), (320, 568, "en"),
])
def test_short_prediction_result_stage_keeps_native_controls(tmp_path, width, height, language):
    """A structural canvas is the leading work area, with no nested viewer scroll."""
    evidence = Path("outputs/native-confidence") / f"stage-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, _ = native_case(state, os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(
            viewport={"width": width, "height": height}, reduced_motion="reduce"
        )
        zh = language == "zh"
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []
        page.on(
            "request",
            lambda request: writes.append(request.url)
            if request.method == "POST" and request.url.startswith(base + "/api/")
            else None,
        )
        page.goto(base + "/#task=" + identifier)
        stage = page.locator(".prediction-result .molecular-stage iframe:visible")
        viewer = page.locator(".prediction-result .viewer-panel:visible")
        modes = viewer.locator(".viewer-modes").first
        expect(modes).to_be_visible(timeout=45000)
        capture = viewer.get_by_role(
            "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
        )
        expect(capture).to_be_enabled(timeout=45000)
        page.evaluate("document.fonts.ready")
        before = page.evaluate("""() => {
          const viewer=document.querySelector('.prediction-result .viewer-panel');
          const work=viewer.closest('.structure-workbench');
          const panel=work.querySelector('.structure-workbench-view');
          const rect=(el)=>{
            const r=el.getBoundingClientRect();
            return [r.top,r.bottom,r.height,r.left,r.right];
          };
          const stage=rect(viewer.querySelector('.molecular-stage'));
          return {
            stage, heading:rect(viewer.querySelector('.studio-heading')),
            modes:rect(viewer.querySelector('.viewer-modes')),
            details:rect(work.querySelector('.structure-workbench-details')),
            scrolled:panel.scrollHeight-panel.clientHeight,
            overflow:document.documentElement.scrollWidth>innerWidth+1,
          };
        }""")
        assert not before["overflow"] and before["scrolled"] <= 1, before
        assert before["heading"][1] <= before["modes"][0] + 1, before
        assert before["modes"][1] <= before["stage"][0] + 1, before
        if width >= 1001:
            bottom = min(height, before["stage"][1])
            assert bottom - before["stage"][0] >= 230, before
            assert before["stage"][4] < before["details"][3], before
            for selector in (
                ".prediction-sample-download button", ".prediction-archive-download button",
            ):
                button = page.locator(".prediction-result " + selector).first.bounding_box()
                assert button and 0 <= button["y"] and button["y"] + button["height"] <= height
        else:
            assert before["stage"][2] >= 319, before
            assert before["stage"][0] < height + 64, before
        page.screenshot(path=evidence / "initial.png")

        camera = """node => node.contentDocument.querySelector('canvas')
          ._3dmol_viewer.getView()"""
        original = stage.element_handle()
        zoom = viewer.get_by_role("button", name="放大" if zh else "Zoom in", exact=True)
        nominal = stage.evaluate(camera)
        zoom.click()
        page.wait_for_function(
            """initial => {
              const el=document.querySelector('.prediction-result .molecular-stage iframe');
              const v=el?.contentDocument?.querySelector('canvas')?._3dmol_viewer;
              return v && Math.abs(v.getView()[3] - initial) > 0.001;
            }""",
            arg=nominal[3],
        )
        adjusted = stage.evaluate(camera)
        expand = viewer.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
        )
        expand.click()
        expect(page.locator(".structure-workbench[data-workspace-expanded]")).to_be_visible()
        assert stage.evaluate("(node, original) => node === original", original)
        expanded = stage.evaluate(camera)
        assert expanded[:3] + expanded[4:] == pytest.approx(adjusted[:3] + adjusted[4:])
        page.screenshot(path=evidence / "expanded.png")
        page.keyboard.press("Escape")
        expect(page.locator(".structure-workbench[data-workspace-expanded]")).to_have_count(0)
        expect(expand).to_be_focused()
        assert stage.evaluate("(node, original) => node === original", original)
        stage.evaluate(
            "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"
        )
        restored = stage.evaluate(camera)
        assert restored == pytest.approx(adjusted, abs=1)
        if width >= 1001:
            trigger = viewer.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            )
            png = export_figure(page, trigger, evidence, "compact-prediction", language)
            inspect_png(png)
            assert stage.evaluate("(node, original) => node === original", original)
            assert stage.evaluate(camera) == pytest.approx(restored, abs=1)
        assert not writes
        browser.close()
