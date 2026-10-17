"""Inspect the actual saved PROTAC regions after a cold case-package restore."""

import hashlib

from example_preview_actions import ready_structure
from playwright.sync_api import expect
from test_navigation_shell_browser import open_navigation


def review_saved_regions(page, language, evidence):
    zh = language == "zh"
    open_navigation(page, language).get_by_role(
        "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
    ).click()
    page.locator(".module-task-picker select:visible").select_option("regions")
    expect(
        page.get_by_role("radio", name="上传新文件" if zh else "Upload a new file", exact=True)
    ).to_be_checked()
    page.locator(".module-template:visible").get_by_role(
        "button", name="示例结果" if zh else "Example results", exact=True
    ).click()
    region = page.get_by_role("region", name="已保存区域" if zh else "Saved regions", exact=True)
    expect(region).to_contain_text("STAT6 PROTAC · two binding-arm hypotheses and connector")
    groups = region.get_by_role("group", name="查看区域" if zh else "View region", exact=True)
    for name, atoms in (
        ("STAT6 arm · structural hypothesis", range(12, 50)),
        ("Piperazine connector", range(6, 12)),
        ("CRBN arm · structural hypothesis", [*range(1, 6), *range(50, 63)]),
    ):
        button = groups.get_by_role("button", name=f"{name} · {len(atoms)}", exact=True)
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        expect(region.locator(".structure-workbench-details > p.field-help")).to_contain_text(
            ", ".join(map(str, atoms))
        )
    region.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
    ).scroll_into_view_if_needed()
    capture = ready_structure(page, zh)
    capture.scroll_into_view_if_needed()
    page.screenshot(path=str(evidence / "regions-native-result.png"), full_page=True)
    region.locator(".viewer-original-downloads summary").click()
    with page.expect_download() as transfer:
        region.get_by_role(
            "link", name="结构 1" if zh else "Structure 1", exact=True
        ).click()
    native = evidence / "regions-native-selection.sdf"
    transfer.value.save_as(native)
    assert hashlib.sha256(native.read_bytes()).hexdigest() == (
        "1a60971c824f4f80d7a378356f2217394f51f3732b605f43440b22dc8d8fe283"
    )
    region.locator(".viewer-original-downloads summary").click()
    capture.click()
    png = page.get_by_role("link", name="下载视图 PNG" if zh else "Download view PNG", exact=True)
    expect(png).to_be_visible(timeout=30000)
    with page.expect_download() as transfer:
        png.click()
    image = evidence / "regions-native-3d.png"
    transfer.value.save_as(image)
    assert image.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") and image.stat().st_size > 5000
    page.get_by_role("button", name="关闭图片" if zh else "Close image", exact=True).click()
