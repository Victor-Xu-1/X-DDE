"""Shared browser actions for read-only native example acceptance."""

from playwright.sync_api import expect
from test_navigation_shell_browser import open_navigation


def ready_structure(page, zh):
    label = "生成三维视图图片" if zh else "Capture 3D view"
    capture = page.locator(f'button[aria-label="{label}"]:visible')
    expect(capture).to_be_enabled(timeout=60000)
    return capture


def choose_task(page, language, key):
    zh = language == "zh"
    if not page.locator(".module-task-picker select:visible").count():
        navigation = open_navigation(page, language)
        navigation.get_by_role(
            "button", name="高通量筛选" if zh else "High-throughput screening", exact=True
        ).click()
    page.locator(".module-task-picker select:visible").select_option(key)
    toolbar = page.locator(".module-template:visible")
    toolbar.get_by_role("button", name="示例结果" if zh else "Example results", exact=True).click()
    expect(
        page.get_by_role("region", name="模板的真实结果" if zh else "Actual template result")
    ).to_be_visible()
