"""Exercise the real native fullscreen API while keeping the original molecular view."""

from playwright.sync_api import expect


def inspect_full_workspace(
    page, viewer, evidence, language, name, inspect=None, changes_source=False
):
    zh = language == "zh"
    workspace = viewer.locator(
        "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),"
        "' structure-workbench ')][1]"
    )
    expect(workspace).to_be_visible()
    source = viewer.locator(".molecular-stage iframe, .simulation-webgl canvas").first
    expect(source).to_be_visible()
    original = source.element_handle()
    expand = viewer.get_by_role(
        "button", name="全屏研究工作区" if zh else "Fullscreen research workspace", exact=True
    )
    expect(expand).to_be_enabled()
    expand.click()
    focused = page.locator(".structure-workbench:fullscreen")
    expect(focused).to_be_visible()
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    view = focused.locator(":scope > .structure-workbench-view").bounding_box()
    details = focused.locator(":scope > .structure-workbench-details").bounding_box()
    bounds = focused.bounding_box()
    viewport = page.evaluate("({width:innerWidth,height:innerHeight})")
    assert view and details and bounds
    assert abs(bounds["width"] - viewport["width"]) <= 2
    assert abs(bounds["height"] - viewport["height"]) <= 2
    if viewport["width"] > 1000:
        assert view["x"] + view["width"] <= details["x"] + 2
        assert view["width"] > details["width"] * 1.7
        assert abs(view["y"] - details["y"]) < 2
    else:
        assert view["y"] + view["height"] <= details["y"] + 2
        scene = viewer.locator(".molecular-stage, .simulation-webgl").first.bounding_box()
        assert scene and scene["y"] + scene["height"] <= details["y"] + 2
    assert source.evaluate("(node,original) => node === original", original)
    if inspect:
        inspect()
    if not changes_source:
        assert source.evaluate("(node,original) => node === original", original)
    # Choosing another candidate legitimately loads its own scene. Fullscreen
    # exit must retain that selected scene rather than restoring the old one.
    selected_source = source.element_handle()
    page.screenshot(path=str(evidence / (name + "-full-workspace.png")), full_page=False)
    viewer.get_by_role("button", name="退出全屏" if zh else "Exit fullscreen", exact=True).click()
    expect(focused).to_have_count(0)
    assert source.evaluate("(node,original) => node === original", selected_source)
    expect(expand).to_be_enabled()
    expand.click()
    expect(focused).to_be_visible()
    expect(
        viewer.get_by_role("button", name="退出全屏" if zh else "Exit fullscreen", exact=True)
    ).to_be_enabled()
    page.keyboard.press("Escape")
    expect(focused).to_have_count(0)
    expect(expand).to_be_enabled()
    assert source.evaluate("(node,original) => node === original", selected_source)
    return {
        "view": view,
        "details": details,
        "viewport": viewport,
        "same_native_view_after_exit": True,
        "escape_exit": True,
    }
