"""Check the visible utility work area and native controls without starting a task."""

import json

from playwright.sync_api import expect

from server_tests.publication_browser_helpers import export_figure, inspect_png


def capture_utility_space(page, utility, evidence):
    geometry = utility.evaluate("""panel => {
      const box = node => {
        const r = node.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom};
      };
      const form = panel.querySelector('.questionnaire');
      const content = panel.closest('.studio-content');
      const actions = form.querySelector('.questionnaire-actions');
      return {panel: box(panel), form: box(form), actions: box(actions),
        content: box(content), fits: content.scrollHeight <= content.clientHeight + 1,
        actionsPosition: getComputedStyle(actions).position,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1};
    }""")
    assert geometry["form"]["width"] >= geometry["panel"]["width"] - 2, geometry
    assert geometry["actionsPosition"] == "static", geometry
    assert not geometry["pageOverflow"], geometry
    if geometry["fits"]:
        bottom_gap = geometry["content"]["bottom"] - geometry["actions"]["bottom"]
        assert 0 <= bottom_gap <= 40, geometry
    (evidence / "utility-first-step-geometry.json").write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=evidence / "utility-first-step.png", full_page=True)


def load_utility_template(page, utility, capability, language, evidence):
    """Hold one real preparation request long enough to inspect its pending UI."""
    pattern = f"**/api/examples/{capability}/prepare"
    label = "使用此模板" if language == "zh" else "Use this template"
    inspect_pending = capability == "properties" and language == "en"
    heading = utility.locator(".questionnaire-page-heading")
    previous = heading.bounding_box()

    def pending(route):
        status = utility.locator('.example-loading[role="status"]')
        expect(status).to_have_text("Preparing template…")
        expect(utility.get_by_role("button", name="Preparing template…")).to_be_disabled()
        current = heading.bounding_box()
        assert current and previous and abs(current["y"] - previous["y"]) <= 1
        # The button carries visible feedback; the live status remains accessible.
        bounds = status.bounding_box()
        assert bounds and bounds["width"] <= 1 and bounds["height"] <= 1, bounds
        page.screenshot(path=evidence / "template-preparing.png", full_page=True)
        route.continue_()

    if inspect_pending:
        page.route(pattern, pending)
    try:
        with page.expect_response(
            lambda response: response.url.split("?")[0].endswith(
                f"/api/examples/{capability}/prepare"
            )
        ) as response:
            utility.get_by_role("button", name=label, exact=True).click()
        assert response.value.ok
        return response.value.json()
    finally:
        if inspect_pending:
            page.unroute(pattern, pending)


def capture_result_line_controls(result, evidence):
    controls = result.locator(".molecule-drawing-style select:visible").evaluate_all("""nodes =>
      nodes.map(node => {
        const style = getComputedStyle(node);
        const context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const label = node.selectedOptions[0].textContent.trim();
        const labelWidth = context.measureText(label).width;
        return {label, labelWidth, width: node.clientWidth,
          fits: labelWidth + 32 <= node.clientWidth};
      })
    """)
    assert len(controls) == result.locator(".molecule-image:not(.is-thumbnail):visible").count()
    assert all(control["fits"] for control in controls), controls
    (evidence / "result-line-controls.json").write_text(json.dumps(controls, indent=2))


def settle_result_capture(result):
    """Wait for the real view to settle; never freeze or restyle it for evidence."""
    result.evaluate("""async root => {
      await document.fonts.ready;
      const images = [...root.querySelectorAll('.molecule-image img')]
        .filter(image => image.getClientRects().length);
      await Promise.all(images.map(image => image.decode()));
      const animations = document.getAnimations().filter(animation =>
        animation.playState === 'running' &&
        Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.all(animations.map(animation => animation.finished));
      for (const table of root.querySelectorAll('.table-scroll, .admet-endpoint-scroll'))
        table.scrollTo({top: 0, left: 0, behavior: 'instant'});
      for (let node = root.parentElement; node; node = node.parentElement)
        node.scrollTo({top: 0, left: 0, behavior: 'instant'});
      window.scrollTo({top: 0, left: 0, behavior: 'instant'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")


def capture_utility_result(page, result, native, language, evidence):
    """Inspect native 2D depictions and export a real 3D render when one exists."""
    zh = language == "zh"
    preview = result.locator(".molecular-preview").first
    drawing_tab = preview.get_by_role("tab", name="二维结构" if zh else "2D structure", exact=True)
    if drawing_tab.count():
        drawing_tab.click()
    drawings = result.locator(".molecule-image:visible")
    assert drawings.count(), "The native utility result must display a molecular structure"
    for drawing in drawings.all():
        drawing.scroll_into_view_if_needed()
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    settle_result_capture(result)
    capture_result_line_controls(result, evidence)
    page.screenshot(path=evidence / "in-utility-example-2d.png", full_page=True)
    structure_tab = preview.get_by_role(
        "tab", name="三维结构" if zh else "3D structure", exact=True
    )
    if native.get("conformers") or structure_tab.count():
        structure_tab.click()
        panel = preview.locator(".viewer-panel")
        expect(panel.locator(".viewer-tools")).to_be_visible(timeout=60000)
        figure = export_figure(
            page, panel.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ), evidence, "in-utility-native-3d", language,
        )
        inspect_png(figure, 600)
        settle_result_capture(result)
        page.screenshot(path=evidence / "in-utility-example-3d.png", full_page=True)
