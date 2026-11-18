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
def image_hosts(root):
    uploads = []

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/session":
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"csrf_token":"controlled-test-session"}')
            else:
                super().do_GET()

        def do_POST(self):
            assert self.path.startswith("/api/assets?")
            body = self.rfile.read(int(self.headers["content-length"]))
            uploads.append(body)
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "id": f"controlled-image-{len(uploads)}", "name": "image-structure.sdf",
                "kind": "ligand",
                "suffix": ".sdf", "size": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                "created_at": "2026-11-17",
            }).encode())

        def log_message(self, *_):
            pass

    servers = []
    try:
        for port in (4322, 8940):
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(root)))
            servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()
        yield uploads
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


@pytest.mark.parametrize("width", [1440, 390])
def test_automatic_import_prefilled_edit_and_nested_query_ownership(compiled_image, width):
    evidence = Path("outputs/utility-image") / str(width)
    evidence.mkdir(parents=True, exist_ok=True)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8A"
        "AwMCAO+a9XcAAAAASUVORK5CYII="
    )
    with image_hosts(compiled_image) as uploads, sync_playwright() as driver:
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
        if width == 390:
            actions = primary.locator(":scope > .image-molecule-actions")
            for name in ("Upload structure image", "Paste screenshot"):
                button = actions.get_by_role("button", name=name, exact=True)
                expect(button).to_be_visible()
                box = button.bounding_box()
                assert box and box["height"] >= 44 and box["width"] >= 44, (name, box)
        primary.locator(':scope > input[type="file"]').set_input_files({
            "name": "STAT6-transport.png", "mimeType": "image/png", "buffer": png,
        })
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
        assert hashlib.sha256(png).hexdigest().encode() in uploads[0]
        primary.get_by_role("button", name="Edit recognized structure", exact=True).click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        frame = dialog.frame_locator("iframe")
        expect(frame.get_by_label("Graph text")).to_have_value("Nc1ccccc1")
        expect(frame.get_by_label("OCR calls")).to_have_text("0")
        frame.get_by_label("Graph text").fill("NCCc1ccccc1")
        dialog.get_by_role("button", name="Use this molecule", exact=True).click()
        expect(page.get_by_label("Primary input", exact=True)).to_have_text("controlled-image-2")
        assert b"NCCc1ccccc1" in uploads[1]
        query = page.locator(".utility-query-image-entry")
        query.get_by_label("Choose structure image", exact=True).set_input_files({
            "name": "query-transport.png", "mimeType": "image/png", "buffer": png,
        })
        expect(page.get_by_label("Query input", exact=True)).to_have_text("controlled-image-3")
        expect(page.get_by_label("Primary input", exact=True)).to_have_text("controlled-image-2")
        page.get_by_role("button", name="Toggle active tool").click()
        page.get_by_role("button", name="Toggle active tool").click()
        expect(page.get_by_label("Primary draft", exact=True)).to_have_value("Keep my draft")
        expect(page.get_by_label("Query draft", exact=True)).to_have_value("Keep query draft")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert not errors and not research_posts
        page.screenshot(path=evidence / "image-import.png", full_page=True)
        (evidence / "acceptance.json").write_text(json.dumps({
            "width": width, "controlled_native_host": True, "actual_ocr": False,
            "scientific_jobs": 0, "uploads": len(uploads), "edited_graph_prefill": True,
            "nested_query_ownership": True, "image_digest_preserved": True,
        }, indent=2))
        browser.close()
