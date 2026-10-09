"""Native chart interaction assertions shared by the actual result consumers."""

from playwright.sync_api import expect


def exercise_plot_view(page, panel, language, bounds=None):
    chart = panel.get_by_role("application")
    panel.get_by_role(
        "combobox", name="Chart interaction" if language == "en" else "图表操作"
    ).select_option("pan")
    expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
    original = chart.evaluate("el => ({x:el.data[0].x,y:el.data[0].y})")
    before = chart.evaluate("el => el._fullLayout.xaxis.range")
    drag = chart.locator(".nsewdrag").bounding_box()
    assert drag
    x, y = drag["x"] + drag["width"] * 0.4, drag["y"] + drag["height"] * 0.5
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + drag["width"] * 0.2, y, steps=10)
    page.mouse.up()
    page.wait_for_function(
        """before => {
      const charts=document.querySelectorAll('.metric-scatter .research-plot-canvas');
      const chart=Array.from(charts).find(el=>el.offsetWidth && el.offsetHeight);
      return chart?._fullLayout.xaxis.range.some(
        (value,index)=>Math.abs(value-before[index])>1e-10);
    }""",
        arg=before,
    )
    assert chart.evaluate("el => ({x:el.data[0].x,y:el.data[0].y})") == original
    panel.get_by_role("button", name="Reset" if language == "en" else "重置", exact=True).click()
    expected = bounds if bounds is not None else before
    page.wait_for_function(
        """expected => {
      const charts=document.querySelectorAll('.metric-scatter .research-plot-canvas');
      const chart=Array.from(charts).find(el=>el.offsetWidth && el.offsetHeight);
      return chart?._fullLayout.xaxis.range.every(
        (value,index)=>Math.abs(value-expected[index])<1e-7);
    }""",
        arg=expected,
    )


def choose_native_point(page, chart, index):
    point = chart.locator(".scatterlayer .point").nth(index)
    point.scroll_into_view_if_needed()
    expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
    box = point.bounding_box()
    assert box
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    expect(chart.locator(".hoverlayer .hovertext")).to_be_visible()
    page.mouse.click(x, y)


def responsive_landscape(page, panel, evidence, language):
    for width in (2560, 1440, 768, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        page.wait_for_function("() => document.documentElement.scrollWidth <= innerWidth + 1")
        panel.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / f"{language}-{width}.png"), full_page=True)
        page.screenshot(path=str(evidence / f"{language}-{width}-viewport.png"))
