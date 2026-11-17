"""Inspect the real result header without changing result state or camera."""

import json

from playwright.sync_api import expect


def inspect_result_header(page, root, language, width, name):
    header = page.locator(".detail-panel.has-header-navigation > .task-detail-header")
    expect(header).to_be_visible()
    nav = header.get_by_role(
        "navigation", name="任务结果导航" if language == "zh" else "Task result navigation"
    )
    expect(nav).to_have_count(1)
    expect(nav).to_be_visible()
    expect(page.get_by_role(
        "button", name="返回任务结果" if language == "zh" else "Back to task results",
        exact=True,
    )).to_have_count(1)
    geometry = header.evaluate("""node => {
      const rect = selector => node.querySelector(selector).getBoundingClientRect().toJSON();
      return {header: node.getBoundingClientRect().toJSON(),
        navigation: rect('nav'), title: rect('.panel-heading'), actions: rect('.task-actions')};
    }""")
    title, navigation, actions = (geometry[key] for key in ("title", "navigation", "actions"))
    if width > 1000:
        assert title["left"] >= navigation["right"]
        assert title["right"] <= actions["left"]
        assert abs(title["top"] - navigation["top"]) < 20
    else:
        assert title["top"] >= navigation["bottom"]
        assert title["right"] <= actions["left"]
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    (root / (name + "-header.json")).write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=root / (name + "-header.png"))


def inspect_refresh_continuity(page, root, language, job_id):
    frame = page.locator(".detail-panel iframe").first
    expect(frame).to_be_visible()
    original = frame.element_handle()
    assert original
    rows = page.locator(".pocket-candidates tbody tr")
    assert rows.count() >= 2
    selected = rows.nth(1)
    selected.click()
    expect(selected).to_have_attribute("aria-selected", "true")
    refresh = page.locator(".task-detail-header").get_by_role(
        "button", name="刷新任务" if language == "zh" else "Refresh tasks", exact=True
    )
    with page.expect_response(
        lambda response: response.url.split("?")[0].endswith("/api/jobs/" + job_id)
        and response.request.method == "GET"
    ):
        refresh.click()
    expect(refresh).to_be_focused()
    expect(selected).to_have_attribute("aria-selected", "true")
    assert original.evaluate("node => node.isConnected")
    assert frame.evaluate("(node, previous) => node === previous", original)
    (root / "retained-pocket-refresh.json").write_text(json.dumps({
        "job_id": job_id, "same_native_frame": True,
        "selected_row_retained": True, "refresh_focus_retained": True,
    }, indent=2))
