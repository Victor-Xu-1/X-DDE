"""Inspect historical prediction inputs from real restored records without submitting a job."""

import hashlib
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
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def track(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.on("request", track)
        input_url = f"/api/jobs/{job_id}/input"
        recorded = page.request.get(base + input_url)
        assert recorded.ok and recorded.headers["x-xdde-input-source"] == "recorded-request"
        with store.connect() as db:
            authored = db.execute("SELECT request FROM jobs WHERE id=?", (job_id,)).fetchone()
        assert recorded.body() == authored["request"].encode()
        assert hashlib.sha256(recorded.body()).hexdigest() == native.request_sha256
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
        overview = dialog.get_by_role("button", name="概览" if zh else "Overview", exact=True)
        expect(overview).to_have_attribute("aria-pressed", "true")
        raw_input = dialog.get_by_label("输入 JSON" if zh else "Input JSON", exact=True)
        expect(raw_input).not_to_be_visible()
        rows = recorded.json()["payload"]["components"]
        protein = next(row for row in rows if row["kind"] == "protein")
        expect(dialog).to_contain_text(f"{len(protein['value'])} aa")
        ligand = next(row for row in rows if row["kind"] == "ligand")
        reference = ligand["source"]
        # Native drawing is deliberately lazy: a narrow user scrolls past the
        # recorded protein construct before the ligand canvas enters view.
        dialog.locator(".molecule-image").scroll_into_view_if_needed()
        drawing = dialog.locator('.molecule-image[data-drawing-state="ready"]')
        expect(drawing).to_be_visible(timeout=90000)
        image = drawing.get_by_role("img")
        expect(image).to_be_visible()
        svg_uri = image.get_attribute("src")
        assert svg_uri and svg_uri.startswith("data:image/svg+xml;base64,")
        selected_file = dialog.get_by_role(
            "link", name="下载已选结构文件" if zh else "Download selected structure input"
        )
        assert selected_file.get_attribute("href") == (
            f"/api/assets/{reference['asset_id']}?record={reference['record']}"
        )
        metadata = page.request.get(f"{base}/api/assets/{reference['asset_id']}/metadata")
        assert metadata.ok and metadata.json()["sha256"] == reference["sha256"]
        assert dialog.evaluate("(dialog) => dialog.getBoundingClientRect().width <= innerWidth")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / "view-input.png")
        dialog.get_by_role("button", name="原始 JSON" if zh else "Original JSON").click()
        expect(raw_input).to_be_visible()
        assert json.loads(raw_input.inner_text()) == recorded.json()
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
        assert archived.headers["x-xdde-input-source"] == "stored-document"
        page.goto(base + "/#task=" + archived_id)
        page.locator(".prediction-result-heading").get_by_role(
            "button", name="查看输入" if zh else "View input", exact=True
        ).click()
        expect(dialog).to_contain_text("已保存的输入文件" if zh else "Stored input document")
        expect(overview).to_have_attribute("aria-pressed", "true")
        expect(raw_input).not_to_be_visible()
        native_sequence = archived.json()[0]["sequences"][0]["proteinChain"]["sequence"]
        expect(dialog).to_contain_text(f"{len(native_sequence)} aa")
        page.screenshot(path=evidence / "view-native-input.png")
        dialog.get_by_role("button", name="原始 JSON" if zh else "Original JSON").click()
        assert json.loads(raw_input.inner_text()) == archived.json()
        assert archived.json() != recorded.json()
        assert not writes
        assert not errors
        assert [entry.model_dump(mode="json") for entry in store.list_jobs(1000)] == before
        (evidence / "acceptance.json").write_text(json.dumps({
            "language": language, "width": width,
            "recorded_request_sha256": hashlib.sha256(recorded.body()).hexdigest(),
            "native_document_sha256": hashlib.sha256(archived.body()).hexdigest(),
            "recorded_construct_residues": len(protein["value"]),
            "native_construct_residues": len(native_sequence),
            "ligand_record": reference["record"], "ligand_asset_sha256": reference["sha256"],
            "native_ketcher_drawing_ready": True, "original_json_optional": True,
            "byte_exact_input_download": True, "research_writes": writes, "page_errors": errors,
        }, indent=2))
        browser.close()
