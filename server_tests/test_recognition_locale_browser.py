"""Compiled wrapper/native-locale protocol; controlled host, no OCR/Ketcher/model claims."""

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
def compiled(tmp_path_factory):
    root = tmp_path_factory.mktemp("recognition-locale-browser")
    assert root.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    code = """
      import {build} from 'vite';
      import react from '@vitejs/plugin-react';
      import path from 'node:path';
      await build({configFile:false,plugins:[react()],
      define:{'process.env.NODE_ENV':'"production"'},resolve:{alias:{
        react:path.resolve('node_modules/react'),
        'react-dom':path.resolve('node_modules/react-dom')
      }},build:{outDir:process.argv[1],lib:{
        entry:path.resolve('../tests/fixtures/recognition_locale/browser.tsx'),
        formats:['es'],fileName:()=> 'contract.js',cssFileName:'contract'}}});
    """
    subprocess.run(
        ["node", "--input-type=module", "-e", code, str(root)], cwd="frontend", check=True
    )
    (root / "index.html").write_text(
        '<!doctype html><html><head><link rel="stylesheet" href="/contract.css"></head>'
        '<body style="margin:0"><div id="root"></div>'
        '<script type="module" src="/contract.js"></script></body></html>'
    )
    return root


@contextmanager
def paired_hosts(root):
    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/utilities/recognition":
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"available":true}')
            else:
                super().do_GET()

        def log_message(self, *_):
            pass

    servers = []
    try:
        for port in (4322, 8940):
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(root)))
            servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()
        yield
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


@pytest.mark.parametrize("width", [1440, 390])
def test_language_switch_retains_source_and_edits_without_dispatch(compiled, width):
    evidence = Path("outputs/recognition-locale") / str(width)
    evidence.mkdir(parents=True, exist_ok=True)
    with paired_hosts(compiled), sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        mutations, errors = [], []
        page.on(
            "request",
            lambda request: mutations.append(request.url) if request.method != "GET" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "pageerror", lambda _: (evidence / "page-errors.json").write_text(json.dumps(errors))
        )
        page.goto("http://127.0.0.1:4322/")
        frame = page.frame_locator("iframe")
        try:
            expect(frame.get_by_role("heading", name="Image recognition")).to_be_visible()
        except AssertionError:
            page.screenshot(path=evidence / "failed-contract.png")
            (evidence / "failed-dom.html").write_text(page.content())
            raise
        frame.get_by_label("Structure image").set_input_files(
            {"name": "STAT6-structure.png", "mimeType": "image/png",
             "buffer": b"controlled transport fixture"}
        )
        editor = frame.get_by_role("textbox", name="Molecular structure")
        editor.fill("edited graph identity")
        for _ in range(2):
            page.get_by_role("button", name="Switch language").click()
            expect(frame.get_by_role("heading", name="图片识别")).to_be_visible()
            expect(frame.get_by_role("textbox", name="分子结构")).to_have_value("edited graph identity")
            expect(frame.get_by_text("STAT6-structure.png")).to_be_visible()
            expect(frame.get_by_text("识别服务已关闭")).to_be_visible()
            expect(frame.get_by_text("图片超过 10 MB。")).to_be_visible()
            page.get_by_role("button", name="Switch language").click()
            expect(editor).to_have_value("edited graph identity")
            expect(frame.get_by_text("Recognition is off")).to_be_visible()
        expect(page.get_by_text("Update the local workbench", exact=False)).to_have_count(0)
        assert not mutations and not errors
        page.screenshot(path=evidence / "controlled-contract.png")
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {"width": width, "languages": ["en", "zh"], "controlled_native_host": True,
                 "native_ketcher": False, "model_execution": False, "new_jobs": 0,
                 "source_and_edits_retained": True}, indent=2
            )
        )
        browser.close()
