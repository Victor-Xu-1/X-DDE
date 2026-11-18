"""Check the visible utility work area and native controls without starting a task."""

import base64
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
      const inputs = form.querySelector('.single-page-main');
      const preview = form.querySelector('.single-page-preview');
      const inputEnd = Math.max(...[...inputs.querySelectorAll('fieldset.single-page-field')]
        .map(field => field.getBoundingClientRect().bottom));
      return {panel: box(panel), form: box(form), actions: box(actions),
        inputs: box(inputs), inputEnd, preview: box(preview), viewport: innerWidth,
        content: box(content), fits: content.scrollHeight <= content.clientHeight + 1,
        actionsPosition: getComputedStyle(actions).position,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1};
    }""")
    assert geometry["form"]["width"] >= geometry["panel"]["width"] - 2, geometry
    assert geometry["actionsPosition"] == "static", geometry
    assert not geometry["pageOverflow"], geometry
    if geometry["viewport"] >= 1100:
        assert geometry["preview"]["x"] < geometry["inputs"]["x"], geometry
        assert geometry["preview"]["width"] > geometry["inputs"]["width"] * 1.45, geometry
        assert geometry["actions"]["x"] >= geometry["inputs"]["x"] - 1, geometry
        assert geometry["actions"]["y"] - geometry["inputEnd"] <= 96, geometry
    if geometry["fits"]:
        assert geometry["actions"]["bottom"] <= geometry["content"]["bottom"] + 1, geometry
    (evidence / "utility-first-step-geometry.json").write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=evidence / "utility-first-step.png", full_page=True)


def verify_image_cancel(page, fields, evidence):
    """Tiny transport fixture checks controls, never scientific recognition."""
    expect(fields.get_by_role(
        "button", name="Upload structure image", exact=True,
    )).to_be_visible()
    fields.get_by_label("Choose structure image", exact=True).set_input_files({
        "name": "image-control.png", "mimeType": "image/png",
        "buffer": base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
            "AwMCAO+a9XcAAAAASUVORK5CYII="
        ),
    })
    dialog = page.get_by_role("dialog", name="Read molecule from image", exact=True)
    expect(dialog).to_be_visible()
    assert not dialog.evaluate("node => Boolean(node.closest('fieldset'))")
    expect(dialog.get_by_role("button", name="Cancel import", exact=True)).to_be_enabled()
    page.screenshot(path=evidence / "image-input-cancel.png", full_page=True)
    dialog.get_by_role("button", name="Cancel import", exact=True).click()
    expect(dialog).to_have_count(0)


def load_utility_template(page, utility, capability, language, evidence):
    """Hold one real preparation request long enough to inspect its pending UI."""
    pattern = f"**/api/examples/{capability}/prepare"
    label = "使用此模板" if language == "zh" else "Use this template"
    inspect_pending = capability == "properties" and language == "en"
    if inspect_pending:
        # Utilities expose the input directly; images never require a Next step.
        verify_image_cancel(page, utility.locator(".utility-task-fields"), evidence)
    heading = utility.locator(".single-page-main")
    previous = heading.bounding_box()

    def pending(route):
        status = utility.locator('.example-loading[role="status"]')
        expect(status).to_have_text("Preparing template…")
        expect(utility.get_by_role("button", name="Preparing template…")).to_be_disabled()
        fields = utility.locator(".utility-task-fields")
        expect(fields).to_have_attribute("disabled", "")
        expect(fields.locator('input[type="radio"]').first).to_be_disabled()
        current = heading.bounding_box()
        assert current and previous and abs(current["y"] - previous["y"]) <= 1
        # The button carries visible feedback; the live status remains accessible.
        bounds = status.bounding_box()
        assert bounds and bounds["width"] <= 1 and bounds["height"] <= 1, bounds
        # Disabled fieldsets do not suppress div events. No image session may open.
        fields.locator(".image-molecule-input:visible").first.evaluate("""node => {
          const data = new DataTransfer();
          data.items.add(new File(['pending-input-control'], 'pending.png',
            {type: 'image/png'}));
          const event = new DragEvent('drop', {bubbles: true, cancelable: true,
            dataTransfer: data});
          node.dispatchEvent(event);
          if (!event.defaultPrevented) throw new Error('Image drop was not consumed');
        }""")
        expect(page.locator(".image-molecule-dialog")).to_have_count(0)
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
        fields = utility.locator(".utility-task-fields")
        expect(fields).not_to_have_attribute("disabled", "")
        expect(fields.locator('input[type="radio"]').first).to_be_enabled()
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


def capture_library_columns(page, result, evidence):
    """Keep native library headers readable and every column reachable on narrow screens."""
    container = result.locator(".discovery-results > .table-scroll")
    if not container.count():
        return
    container.locator("thead").scroll_into_view_if_needed()
    geometry = container.evaluate("""root => {
      const context = document.createElement('canvas').getContext('2d');
      const headers = [...root.querySelectorAll('th')].map(cell => {
        const style = getComputedStyle(cell);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = cell.textContent.trim();
        const needed = context.measureText(text).width +
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return {text, needed, width: cell.clientWidth, fits: needed <= cell.clientWidth + 1};
      });
      root.scrollLeft = root.scrollWidth;
      return {headers, width: root.clientWidth, scrollWidth: root.scrollWidth,
        reachedEnd: root.scrollLeft + root.clientWidth >= root.scrollWidth - 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1};
    }""")
    assert geometry["headers"], geometry
    assert all(header["fits"] for header in geometry["headers"]), geometry
    assert geometry["reachedEnd"] and not geometry["pageOverflow"], geometry
    (evidence / "library-column-geometry.json").write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=evidence / "library-rightmost-columns-viewport.png")
    settle_result_capture(result)


def capture_utility_result(page, result, native, language, evidence):
    """Inspect native 2D depictions and export a real 3D render when one exists."""
    zh = language == "zh"
    preview = result.locator(".molecular-preview, .admet-selected-molecule").first
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
    capture_library_columns(page, result, evidence)
    page.screenshot(path=evidence / "in-utility-example-2d.png", full_page=True)
    page.screenshot(path=evidence / "in-utility-example-2d-viewport.png")
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
        page.screenshot(path=evidence / "in-utility-example-3d-viewport.png")
