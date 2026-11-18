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
        if header.evaluate("node => node.classList.contains('has-extra-actions')"):
            # The mobile header gives visible backend and task actions their own row.
            assert actions["top"] >= title["bottom"]
            assert actions["left"] >= geometry["header"]["left"]
            assert actions["right"] <= geometry["header"]["right"]
        else:
            assert title["right"] <= actions["left"]
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    (root / (name + "-header.json")).write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=root / (name + "-header.png"))


def inspect_refresh_continuity(page, root, language, job_id):
    expect(page.locator(".detail-panel").get_by_role(
        "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓", exact=True
    )).to_be_enabled(timeout=45000)
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
    started = page.evaluate("Date.now()")
    job_path = "/api/jobs/" + job_id
    with (
        page.expect_request(
            lambda request: request.url.split("?")[0].endswith(job_path)
            and request.method == "GET"
        ) as job_read,
        page.expect_request(
            lambda request: request.url.split("?")[0].endswith(job_path + "/artifacts")
            and request.method == "GET"
        ) as artifact_read,
    ):
        refresh.click()
    responses = []
    for request in (job_read.value, artifact_read.value):
        response = request.response()
        assert response and response.ok and response.finished() is None
        assert request.timing["startTime"] >= started
        responses.append(response)
    assert responses[0].json()["id"] == job_id
    assert isinstance(responses[1].json(), list) and responses[1].json()
    # Completed bodies have reached the browser; inspect after its rendered update.
    page.evaluate("""() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)))""")
    expect(refresh).to_be_focused()
    expect(selected).to_have_attribute("aria-selected", "true")
    assert original.evaluate("node => node.isConnected")
    assert frame.evaluate("(node, previous) => node === previous", original)
    (root / "retained-pocket-refresh.json").write_text(json.dumps({
        "job_id": job_id, "same_native_frame": True,
        "selected_row_retained": True, "refresh_focus_retained": True,
        "fresh_job_and_artifact_reads_completed": True,
    }, indent=2))
