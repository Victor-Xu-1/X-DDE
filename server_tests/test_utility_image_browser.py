"""Real browser/origin/clipboard transport; controlled host, never OCR/science claims."""
import base64
import hashlib
import json
import os
import subprocess
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright


@pytest.fixture(scope="module")
def compiled_image(tmp_path_factory):
    root = tmp_path_factory.mktemp("utility-image-browser")
    assert root.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    code = """
      import {build} from 'vite'; import react from '@vitejs/plugin-react';
      import path from 'node:path';
      await build({configFile:false,plugins:[react()],
      define:{'process.env.NODE_ENV':'"production"'},resolve:{alias:{
      react:path.resolve('node_modules/react'),'react-dom':path.resolve('node_modules/react-dom')}},
      build:{outDir:process.argv[1],lib:{
      entry:path.resolve('../tests/fixtures/utility_image/browser.tsx'),
      formats:['es'],fileName:()=> 'contract.js',cssFileName:'contract'}}});
    """
    subprocess.run(
        ["node", "--input-type=module", "-e", code, str(root)], cwd="frontend", check=True,
    )
    (root / "index.html").write_text(
        '<!doctype html><html><head><link rel="stylesheet" href="/contract.css"></head>'
        '<body><div id="root"></div><script type="module" src="/contract.js"></script>'
        '</body></html>'
    )
    return root


@contextmanager
def image_hosts(root, idle_power=True):
    uploads = []
    assets = []
    power_commands = []
    power_enabled = False

    def power_state():
        return json.dumps({
            "available": True, "port": 8940,
            **({"idle_power": True} if idle_power else {}),
            "power": {"enabled": power_enabled, "phase": "ready" if power_enabled else "stopped"},
        }).encode()

    class Handler(SimpleHTTPRequestHandler):
        def write_json(self, body):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            replies = {
                "/api/session": b'{"csrf_token":"controlled-test-session"}',
                "/api/utilities/recognition": b'{"available":true,"port":8940}',
                "/api/utilities/recognition?include_power=true": power_state(),
            }
            path = urlsplit(self.path).path
            if path == "/api/assets":
                self.write_json(json.dumps(assets).encode())
                return
            for asset in assets:
                if path == f"/api/assets/{asset['id']}/metadata":
                    self.write_json(json.dumps(asset).encode())
                    return
            if reply := replies.get(self.path):
                self.write_json(reply)
            else:
                super().do_GET()

        def do_POST(self):
            nonlocal power_enabled
            if self.path in {"/api/utilities/recognition/start", "/api/utilities/recognition/stop"}:
                if self.server.server_port == 4322:
                    assert self.headers["X-Workbench-CSRF"] == "controlled-test-session"
                power_enabled = self.path.endswith("/start")
                power_commands.append((self.server.server_port, power_enabled))
                self.write_json(power_state())
                return
            assert self.path.startswith("/api/assets?")
            body = self.rfile.read(int(self.headers["content-length"]))
            uploads.append(body)
            asset = {
                "id": f"controlled-image-{len(uploads)}",
                "name": parse_qs(urlsplit(self.path).query)["name"][0],
                "kind": "ligand",
                "suffix": ".sdf", "size": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                "created_at": "2026-11-17",
            }
            assets.append(asset)
            self.write_json(json.dumps(asset).encode())

        def log_message(self, *_):
            pass

    servers = []
    try:
        for port in (4322, 8940):
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(root)))
            servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()
        yield uploads, power_commands
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


@pytest.mark.parametrize("width", [1440, 390])
def test_explicit_power_edit_and_nested_query_ownership(compiled_image, width):
    evidence = Path("outputs/utility-image") / str(width)
    evidence.mkdir(parents=True, exist_ok=True)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
        "AwMCAO+a9XcAAAAASUVORK5CYII="
    )
    with image_hosts(compiled_image) as (uploads, power_commands), sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 900})
        errors, research_posts, console, failed_requests = [], [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda item: console.append({"type": item.type, "text": item.text}))
        page.on("requestfailed", lambda item: failed_requests.append(item.url))
        page.add_init_script("""window.__imageProtocolTest = [];
          addEventListener('message', event => {
            if (event.data?.type?.startsWith('xdde-image:'))
              window.__imageProtocolTest.push({type:event.data.type, valid:event.data.valid,
                phase:event.data.recognitionPhase, supported:event.data.recognitionSupported});
          });""")
        page.on("request", lambda request: research_posts.append(request.url)
                if request.method == "POST" and "/api/jobs" in request.url else None)
        page.goto("http://127.0.0.1:4322/")
        primary = page.locator(".utility-image-entry")
        actions = primary.locator(":scope > .image-molecule-actions")
        upload = actions.get_by_role("button", name="Upload structure image", exact=True)
        paste = actions.get_by_role("button", name="Paste screenshot", exact=True)
        primary_power = actions.get_by_role("switch", name="DECIMER", exact=True)
        draft = page.get_by_label("Primary draft", exact=True)
        expect(primary_power).to_be_enabled()
        expect(primary_power).not_to_be_checked()
        assert not power_commands and not uploads
        assert page.locator("iframe").count() == 0
        page.get_by_role("button", name="Toggle active tool").focus()
        for element in (upload, paste, primary_power, draft):
            page.keyboard.press("Tab")
            expect(element).to_be_focused()
        assert upload.bounding_box()["y"] < draft.bounding_box()["y"]
        page.keyboard.press("Shift+Tab")
        expect(primary_power).to_be_focused()
        if width == 390:
            for button in (upload, paste):
                box = button.bounding_box()
                assert box and box["height"] >= 44 and box["width"] >= 44
        query = page.locator('[data-image-target="query"]')
        expect(query.get_by_role("switch", name="DECIMER", exact=True)).to_have_count(0)
        primary_power.press("Space")
        expect(primary_power).to_be_checked()
        primary_power.click()
        expect(primary_power).not_to_be_checked()
        assert power_commands == [(4322, True), (4322, False)]
        assert page.locator("iframe").count() == 0
        page.get_by_label("Query draft", exact=True).focus()
        page.keyboard.press("Tab")
        expect(query.get_by_role(
            "button", name="Upload query image", exact=True
        )).to_be_focused()
        primary.locator(':scope > input[type="file"]').set_input_files({
            "name": "unsupported.gif", "mimeType": "image/gif", "buffer": png,
        })
        message = primary.get_by_role("alert")
        expect(message).to_contain_text("Use a PNG, JPEG, WebP or BMP image")
        assert message.bounding_box()["y"] < draft.bounding_box()["y"]
        assert not uploads
        primary.locator(':scope > input[type="file"]').set_input_files({
            "name": "STAT6-transport.png", "mimeType": "image/png", "buffer": png,
        })
        dialog = page.get_by_role("dialog")
        frame = dialog.frame_locator("iframe")
        power = frame.get_by_role("switch", name="Recognition backend")
        expect(power).to_be_visible()
        expect(power).not_to_be_checked()
        expect(frame.get_by_label("OCR calls")).to_have_text("0")
        expect(dialog.get_by_role("button", name="Use this molecule")).to_be_disabled()
        assert not uploads
        page.screenshot(path=evidence / "recognition-off.png")
        replacement = png + b"replacement image fixture"
        frame.get_by_label("Replace image").set_input_files({
            "name": "replacement-transport.png", "mimeType": "image/png", "buffer": replacement,
        })
        expect(dialog.locator('footer [role="status"]')).to_have_text(
            "replacement-transport.png",
        )
        power.press("Space")
        try:
            expect(page.get_by_label("Primary input", exact=True)).to_have_text(
                "controlled-image-1",
            )
        except AssertionError:
            page.screenshot(path=evidence / "failed-import.png", full_page=True)
            (evidence / "failed-dom.html").write_text(page.content())
            (evidence / "failed-import.json").write_text(json.dumps({
                "errors": errors, "console": console, "requests_failed": failed_requests,
                "uploads": len(uploads), "frames": [frame.url for frame in page.frames],
                "messages": page.evaluate("window.__imageProtocolTest"),
            }, indent=2))
            raise
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert b"Image-assisted molecular input" in uploads[0]
        assert hashlib.sha256(replacement).hexdigest().encode() in uploads[0]
        expect(primary_power).to_be_checked()
        expect(page.locator("iframe")).to_have_count(0)
        primary_power.press("Space")
        expect(primary_power).not_to_be_checked()
        page.screenshot(path=evidence / "recognition-power-in-task.png")
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(primary_power).to_be_focused()
        expect(page.get_by_label("Primary input", exact=True)).to_have_text("controlled-image-1")
        assert len(uploads) == 1
        primary.get_by_role("button", name="Edit recognized structure", exact=True).click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        frame = dialog.frame_locator("iframe")
        expect(frame.get_by_label("Graph text")).to_have_value("Nc1ccccc1")
        expect(frame.get_by_label("OCR calls")).to_have_text("0")
        power = frame.get_by_role("switch", name="Recognition backend")
        expect(power).not_to_be_checked()
        frame.get_by_label("Graph text").fill("NCCc1ccccc1")
        dialog.get_by_role("button", name="Use this molecule", exact=True).click()
        expect(page.get_by_label("Primary input", exact=True)).to_have_text("controlled-image-2")
        assert b"NCCc1ccccc1" in uploads[1]
        query.locator('input[type="file"][accept^="image/png"]').set_input_files({
            "name": "query-transport.png", "mimeType": "image/png", "buffer": png,
        })
        frame = page.get_by_role("dialog").frame_locator("iframe")
        power = frame.get_by_role("switch", name="Recognition backend")
        expect(power).not_to_be_checked()
        expect(frame.get_by_label("OCR calls")).to_have_text("0")
        power.click()
        expect(page.get_by_label("Query input", exact=True)).to_have_text("controlled-image-3")
        expect(primary_power).to_be_checked()
        primary_power.click()
        expect(primary_power).not_to_be_checked()
        expect(page.get_by_label("Primary input", exact=True)).to_have_text("controlled-image-2")
        page.get_by_role("button", name="Toggle active tool").click()
        expect(page.locator(".image-molecule-dialog iframe")).to_have_count(0)
        page.get_by_role("button", name="Toggle active tool").click()
        expect(page.get_by_label("Primary draft", exact=True)).to_have_value("Keep my draft")
        expect(page.get_by_label("Query draft", exact=True)).to_have_value("Keep query draft")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert not errors and not research_posts
        assert power_commands == [
            (4322, True), (4322, False), (8940, True), (4322, False),
            (8940, True), (4322, False),
        ]
        page.screenshot(path=evidence / "image-import.png", full_page=True)
        (evidence / "acceptance.json").write_text(json.dumps({
            "width": width, "controlled_native_host": True, "actual_ocr": False,
            "scientific_jobs": 0, "uploads": len(uploads), "edited_graph_prefill": True,
            "nested_query_ownership": True, "image_digest_preserved": True,
            "primary_controls_follow_visual_tab_order": True, "inline_format_error": True,
            "off_on_entry": True, "explicit_recognition_enable_and_disable": True,
            "inline_power_retains_input_and_focus": True,
            "inline_power_before_input_without_native_frame": True,
            "replacement_source_digest": True,
        }, indent=2))
        browser.close()


@pytest.mark.parametrize(("width", "height"), [(1001, 580), (1100, 650)])
def test_short_desktop_image_dialog_leaves_room_for_the_editor(compiled_image, width, height):
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
        "AwMCAO+a9XcAAAAASUVORK5CYII="
    )
    with image_hosts(compiled_image) as (uploads, power_commands), sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto("http://127.0.0.1:4322/")
        primary = page.locator(".utility-image-entry:not([data-image-target])")
        primary.locator(':scope > input[type="file"]').set_input_files({
            "name": "desktop-screenshot.png", "mimeType": "image/png", "buffer": png,
        })
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        editor = dialog.locator("iframe").bounding_box()
        apply = dialog.get_by_role("button", name="Use this molecule").bounding_box()
        assert editor["height"] >= height * 0.72
        assert editor["y"] + editor["height"] <= apply["y"]
        assert apply["y"] + apply["height"] <= height
        expect(dialog.frame_locator("iframe").get_by_role("switch")).not_to_be_checked()
        page.get_by_role("button", name="Close image recognition").click()
        expect(dialog).to_have_count(0)
        assert not uploads and not power_commands
        browser.close()


def test_legacy_recognition_power_keeps_the_import_and_draft(compiled_image):
    with (
        image_hosts(compiled_image, idle_power=False) as (uploads, power_commands),
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:4322/")
        actions = page.locator(".utility-image-entry > .image-molecule-actions")
        inline = actions.get_by_role("switch", name="DECIMER")
        expect(inline).to_be_disabled()
        page.locator('.utility-image-entry > input[type="file"]').set_input_files({
            "name": "legacy.png", "mimeType": "image/png",
            "buffer": base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
                "AwMCAO+a9XcAAAAASUVORK5CYII="
            ),
        })
        dialog = page.get_by_role("dialog")
        dialog.frame_locator("iframe").get_by_role("switch").click()
        draft = page.get_by_label("Primary draft", exact=True)
        selected = page.get_by_label("Primary input", exact=True)
        expect(selected).to_have_text("controlled-image-1")
        expect(dialog).to_have_count(0)
        expect(inline).to_be_disabled()
        with page.expect_popup() as opened:
            actions.get_by_role("link", name="Manage recognition in a new tab").click()
        popup = opened.value
        expect(popup).to_have_url("http://127.0.0.1:8940/?lang=en")
        toggle = popup.get_by_role("switch", name="Recognition backend")
        expect(toggle).to_be_checked()
        toggle.click()
        expect(toggle).not_to_be_checked()
        popup.close()
        expect(draft).to_have_value("Keep my draft")
        expect(selected).to_have_text("controlled-image-1")
        assert page.locator("iframe").count() == 0
        assert len(uploads) == 1 and power_commands == [(8940, True), (8940, False)]
        browser.close()


def test_editor_drawing_reaches_the_selected_utility_only_on_acceptance(compiled_image):
    with image_hosts(compiled_image) as (uploads, power_commands), sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        posts = []
        page.on("request", lambda req: posts.append(req.url) if req.method == "POST" else None)
        page.goto("http://127.0.0.1:4322/?audit=drawing")
        frame = page.frame_locator(".utility-recognition-frame")
        destination = page.get_by_role("combobox", name="Use structure in a task")
        drawing = frame.get_by_label("Graph text")
        expect(destination).to_be_disabled()
        drawing.fill("Nc1ccccc1")
        expect(destination).to_be_enabled()
        destination.select_option("properties")
        offer = page.get_by_role("group", name="Drawing ready")
        expect(offer).to_be_visible()
        assert not uploads and not posts
        offer.get_by_role("button", name="Dismiss").click()
        expect(offer).to_have_count(0)
        page.get_by_role("button", name="Image recognition & editor", exact=True).click()
        expect(drawing).to_have_value("Nc1ccccc1")
        destination.select_option("properties")
        offer.get_by_role("button", name="Use as input").click()
        expect(offer).to_have_count(0)
        assert len(uploads) == 1 and len(posts) == 1
        assert "/api/assets?kind=ligand&name=editor-structure.sdf" in posts[0]
        assert b"Nc1ccccc1" in uploads[0]
        assert b"Molecular editor drawing" in uploads[0] and b"XDDE_IMAGE_SHA256" not in uploads[0]
        assert not power_commands
        browser.close()


def test_editor_drawing_becomes_the_similarity_query_without_replacing_the_library(compiled_image):
    with image_hosts(compiled_image) as (uploads, power_commands), sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        jobs = []
        page.on("request", lambda req: jobs.append(req.url) if "/api/jobs" in req.url else None)
        page.goto("http://127.0.0.1:4322/?audit=drawing")
        page.get_by_role("button", name="Similarity & structural alerts", exact=True).click()
        library = page.locator('[data-image-target="library"]:visible')
        query = page.locator('[data-image-target="query"]:visible')
        retained_library = library.locator(
            '[data-material-selection="summary"] .reference-material-summary'
        )
        mode = page.get_by_label("What should this selection do?")
        original_mode = mode.input_value()
        expect(library.get_by_role("switch", name="DECIMER")).not_to_be_checked()
        expect(query.get_by_role("switch", name="DECIMER")).to_have_count(0)
        library.locator('input[type="file"][accept=".sdf"]').set_input_files({
            "name": "retained-library.sdf",
            "mimeType": "chemical/x-mdl-sdfile",
            "buffer": b"Original library records\nM  END\n$$$$\n",
        })
        expect(retained_library.get_by_text("retained-library.sdf", exact=True)).to_be_visible()
        change = retained_library.get_by_role("button", name="Change SDF molecular library file")
        expect(change).to_have_attribute("aria-expanded", "false")
        change.press("Enter")
        expect(library.get_by_role("radio", name="Upload a new file")).to_be_checked()
        library.get_by_role("button", name="Done SDF molecular library file").press("Enter")
        expect(change).to_be_focused()
        page.get_by_role("button", name="Image recognition & editor", exact=True).click()
        frame = page.frame_locator(".utility-recognition-frame")
        drawing = frame.get_by_label("Graph text")
        drawing.fill("Nc1ccccc1")
        destination = page.get_by_role("combobox", name="Use structure in a task")
        destination.select_option("screen")
        offer = query.get_by_role("group", name="Drawing ready")
        expect(offer).to_be_visible()
        expect(retained_library.get_by_text("retained-library.sdf", exact=True)).to_be_visible()
        expect(mode).to_have_value(original_mode)
        assert len(uploads) == 1
        query_upload = query.get_by_role("button", name="Upload query image", exact=True)
        offer.get_by_role("button", name="Dismiss", exact=True).press("Enter")
        expect(offer).to_have_count(0)
        expect(query_upload).to_be_focused()
        expect(mode).to_have_value(original_mode)
        page.get_by_role("button", name="Image recognition & editor", exact=True).click()
        expect(drawing).to_have_value("Nc1ccccc1")
        destination.select_option("screen")
        offer.get_by_role("button", name="Use as query", exact=True).click()
        expect(offer).to_have_count(0)
        expect(mode).to_have_value("similarity")
        expect(retained_library.get_by_text("retained-library.sdf", exact=True)).to_be_visible()
        expect(query.locator('[data-material-selection="summary"]')).to_contain_text("Record 1")
        expect(page.locator(".molecular-input-review figcaption")).to_have_text(
            "Query molecule · Record 1"
        )
        assert len(uploads) == 2 and b"Nc1ccccc1" in uploads[1]
        expect(query_upload).to_be_focused()
        assert not jobs and not power_commands
        browser.close()


@pytest.mark.parametrize(("initial_mode", "resolved_mode"), [
    ("inventory", "similarity"),
    ("substructure", "substructure"),
])
def test_paste_query_on_the_purpose_field_preserves_the_library(
    compiled_image, initial_mode, resolved_mode,
):
    png = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
        "AwMCAO+a9XcAAAAASUVORK5CYII="
    )
    with image_hosts(compiled_image) as (uploads, power_commands), sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1024, "height": 650})
        jobs = []
        page.on("request", lambda req: jobs.append(req.url) if "/api/jobs" in req.url else None)
        page.goto("http://127.0.0.1:4322/?audit=drawing")
        page.get_by_role("button", name="Similarity & structural alerts", exact=True).click()
        library = page.locator('[data-image-target="library"]:visible')
        query = page.locator('[data-image-target="query"]:visible')
        retained = library.locator(
            '[data-material-selection="summary"] .reference-material-summary'
        ).get_by_text("retained-library.sdf", exact=True)
        purpose = page.get_by_label("What should this selection do?")
        purpose.focus()
        purpose.select_option(initial_mode)
        expect(purpose).to_be_focused()
        shortcut = "Paste screenshot to find similar" if initial_mode == "inventory" else (
            "Paste query image"
        )
        expect(query.get_by_role("button", name=shortcut, exact=True)).to_be_visible()
        library.locator('input[type="file"][accept=".sdf"]').set_input_files({
            "name": "retained-library.sdf",
            "mimeType": "chemical/x-mdl-sdfile",
            "buffer": b"Original library records\nM  END\n$$$$\n",
        })
        expect(retained).to_be_visible()
        expect(library.get_by_role("switch", name="DECIMER")).not_to_be_checked()
        purpose.focus()
        purpose.evaluate("""(field, image) => {
          const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0));
          const clipboardData = new DataTransfer();
          clipboardData.items.add(new File([bytes], 'query.png', { type:'image/png' }));
          field.dispatchEvent(new ClipboardEvent('paste', {
            bubbles:true, cancelable:true, clipboardData
          }));
        }""", png)
        dialog = page.get_by_role("dialog")
        expect(dialog.locator('footer [role="status"]')).to_have_text("query.png")
        expect(purpose).to_have_value(initial_mode)
        assert len(uploads) == 1 and not power_commands
        dialog.frame_locator("iframe").get_by_role("switch", name="Recognition backend").click()
        expect(dialog).to_have_count(0)
        expect(purpose).to_have_value(resolved_mode)
        expect(retained).to_be_visible()
        expect(query.locator('[data-material-selection="summary"]')).to_contain_text("Record 1")
        expect(page.locator(".molecular-input-review figcaption")).to_have_text(
            "Query molecule · Record 1"
        )
        assert len(uploads) == 2 and b"Controlled protocol fixture\nM  END\n" in uploads[1]
        assert hashlib.sha256(base64.b64decode(png)).hexdigest().encode() in uploads[1]
        assert not jobs and power_commands == [(8940, True)]
        browser.close()
