"""Exercise shared viewing controls on the actual native molecular drawing."""

from playwright.sync_api import expect


def inspect_molecular_viewing(page, preview, evidence, language):
    zh = language == "zh"
    canvas = preview.get_by_role(
        "region", name="二维结构画布" if zh else "2D structure canvas", exact=True
    )
    image = canvas.get_by_role("img")
    original = image.get_attribute("src")
    expect(canvas).to_have_attribute("data-zoom", "1")
    for _ in range(2):
        preview.get_by_role(
            "button", name="放大预览" if zh else "Zoom in preview", exact=True
        ).click()
    expect(canvas).to_have_attribute("data-zoom", "3")
    assert canvas.evaluate("view => view.scrollWidth > view.clientWidth * 2")
    start = canvas.evaluate("view => view.scrollLeft")
    canvas.press("ArrowRight")
    page.wait_for_function(
        "start => document.querySelector('.molecule-inspection-view .figure-preview-sheet')"
        ".scrollLeft > start",
        arg=start,
    )
    bounds = canvas.bounding_box()
    x, y = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
    start = canvas.evaluate("view => view.scrollLeft")
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 45, y - 20, steps=4)
    page.mouse.up()
    assert canvas.evaluate("view => view.scrollLeft") > start
    assert image.get_attribute("src") == original
    page.screenshot(path=evidence / "protac-magnified-390.png", full_page=False)
    preview.get_by_role("button", name="适应窗口" if zh else "Fit preview", exact=True).click()
    expect(canvas).to_have_attribute("data-zoom", "1")
    assert canvas.evaluate("view => view.scrollLeft === 0 && view.scrollTop === 0")
    assert image.get_attribute("src") == original
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
