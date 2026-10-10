"""Native figure magnification and input focus, without scientific execution."""

import json

from playwright.sync_api import expect


def inspect_zoom(page, dialog, evidence, name, language):
    zh = language == "zh"
    view = dialog.get_by_role("region", name="图件画布" if zh else "Figure canvas", exact=True)
    image = view.locator("img")
    source = image.get_attribute("src")
    initial = image.bounding_box()
    plus = dialog.get_by_role("button", name="放大预览" if zh else "Zoom in preview", exact=True)
    for _ in range(3):
        plus.click()
    expect(view).to_have_attribute("data-zoom", "4")
    expect(plus).to_be_disabled()
    enlarged = image.bounding_box()
    assert enlarged["width"] > initial["width"] * 3.7, (initial, enlarged)
    before = view.evaluate("node => ({x:node.scrollLeft,y:node.scrollTop})")
    box = view.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 60, y + 45, steps=5)
    page.mouse.up()
    after = view.evaluate("node => ({x:node.scrollLeft,y:node.scrollTop})")
    assert abs(before["x"] - after["x"] - 60) < 3, (before, after)
    assert abs(before["y"] - after["y"] - 45) < 3, (before, after)
    expect(view).to_be_focused()
    page.keyboard.press("ArrowRight")
    page.wait_for_function(
        "value => value.node.scrollLeft > value.x + 10",
        arg={"node": view.element_handle(), "x": after["x"]},
        timeout=5000,
    )
    page.screenshot(path=evidence / (name + "-detail.png"))
    assert image.get_attribute("src") == source
    dialog.get_by_role("button", name="适应窗口" if zh else "Fit preview", exact=True).click()
    expect(view).to_have_attribute("data-zoom", "1")
    assert view.evaluate("node => node.scrollLeft === 0 && node.scrollTop === 0")
    assert image.get_attribute("src") == source
    (evidence / (name + "-viewing.json")).write_text(
        json.dumps(
            {
                "fit": initial,
                "detail": enlarged,
                "before_drag": before,
                "after_drag": after,
                "same_native_bytes": True,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
