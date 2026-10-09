"""Native chart interaction assertions shared by the actual result consumers."""

from playwright.sync_api import expect


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
