"""Native result navigation and graphical evidence, independent of inference."""

import hashlib
import os
from pathlib import Path

from layout_browser_helpers import catalog
from playwright.sync_api import expect

EVIDENCE = Path("server_tests/evidence/ensemble")


def open_result(page, name):
    catalog(page)
    page.get_by_role("button", name=name, exact=True).and_(page.locator(".tool-card")).click()
    page.locator(".module-template:visible").get_by_role(
        "button", name="示例结果", exact=True
    ).click()
    expect(page.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
        timeout=30000
    )


def preserve_assets(page, references):
    base = os.environ["WB_BROWSER_URL"]
    return {
        ref["asset_id"]: hashlib.sha256(
            page.request.get(base + "/api/assets/" + ref["asset_id"]).body()
        ).hexdigest()
        for ref in references
    }


def capture(page, name):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    page.screenshot(path=EVIDENCE / (name + ".png"))


def paired_layout(page, width, detail_selector):
    page.set_viewport_size({"width": width, "height": 1000})
    layout = page.locator(".ensemble-result-layout")
    layout.scroll_into_view_if_needed()
    left = layout.locator(".ensemble-result-list").bounding_box()
    right = layout.locator(detail_selector).bounding_box()
    assert left and right
    if width > 1000:
        assert left["x"] + left["width"] <= right["x"] and abs(left["y"] - right["y"]) <= 3
    else:
        assert right["y"] + right["height"] <= left["y"]
    return {"width": width, "list": left, "preview": right}


def download(page, control, filename):
    with page.expect_download(timeout=30000) as event:
        control.click()
    target = EVIDENCE / filename
    event.value.save_as(target)
    return target.read_bytes()
