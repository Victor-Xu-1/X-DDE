"""Inspect historical prediction inputs from real restored records without submitting a job."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_historical_prediction_input_replays_and_downloads_the_exact_document(
    restored_workspace, language, width
):
    settings, store, pins = restored_workspace
    native = pins.get("boltz.predict", verify=True)
    opendde = pins.get("predict", verify=True)
    assert native and opendde
    job_id = str(native.job_id)
    evidence = Path("outputs/prediction-history-input") / language
    evidence.mkdir(parents=True, exist_ok=True)
    before = [entry.model_dump(mode="json") for entry in store.list_jobs(1000)]
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(
            viewport={"width": width, "height": 960},
            accept_downloads=True,
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []

        def track(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.on("request", track)
        input_url = f"/api/jobs/{job_id}/input"
        recorded = page.request.get(base + input_url)
        assert recorded.ok and recorded.headers["x-xdde-input-source"] == "recorded-request"
        assert recorded.json() == store.get(job_id).request.model_dump(mode="json")
        page.goto(base + "/#task=" + job_id)
        trigger = page.get_by_role("button", name="查看输入" if zh else "View input", exact=True)
        page.route("**" + input_url, lambda route: route.fulfill(status=503), times=1)
        trigger.click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("alert")).to_be_visible()
        download = dialog.get_by_role("button", name="下载 JSON" if zh else "Download JSON")
        expect(download).to_have_count(0)
        dialog.get_by_role("button", name="重试读取" if zh else "Retry loading").click()
        expect(download).to_be_enabled()
        expect(dialog).to_contain_text(
            "任务记录中的提交请求" if zh else "Submitted request from the task record"
        )
        assert json.loads(dialog.locator("pre").inner_text()) == recorded.json()
        assert dialog.evaluate("(dialog) => dialog.getBoundingClientRect().width <= innerWidth")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / "view-input.png")
        with page.expect_download() as receipt:
            download.click()
        assert receipt.value.suggested_filename == f"{job_id}-input.json"
        assert receipt.value.path().read_bytes() == recorded.body()
        dialog.get_by_role("button", name="复制 JSON" if zh else "Copy JSON").click()
        expect(dialog.get_by_role("button", name="已复制" if zh else "Copied")).to_be_visible()
        assert page.evaluate("navigator.clipboard.readText()") == recorded.text()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(trigger).to_be_focused()

        archived_id = str(opendde.job_id)
        archived = page.request.get(f"{base}/api/jobs/{archived_id}/input")
        assert archived.ok
        assert archived.headers["x-xdde-input-source"] == "retained"
        page.goto(base + "/#task=" + archived_id)
        page.locator(".prediction-result-heading").get_by_role(
            "button", name="查看输入" if zh else "View input", exact=True
        ).click()
        expect(dialog).to_contain_text("已保存的输入文件" if zh else "Stored input document")
        assert json.loads(dialog.locator("pre").inner_text()) == archived.json()
        assert archived.json() != recorded.json()
        assert not writes
        assert [entry.model_dump(mode="json") for entry in store.list_jobs(1000)] == before
        browser.close()
