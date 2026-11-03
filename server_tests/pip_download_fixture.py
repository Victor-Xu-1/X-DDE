"""A local wheel transport fixture that deliberately truncates one response."""

import io
import re
import socket
import threading
import zipfile
from contextlib import AbstractContextManager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FILENAME = "xdde_transport_fixture-0.0.0-py3-none-any.whl"


def fixture_wheel():
    content = io.BytesIO()
    files = {
        "xdde_transport_fixture/__init__.py": b"# Transport fixture only; no research result.\n",
        "xdde_transport_fixture/padding.bin": bytes(range(256)) * 8192,
        "xdde_transport_fixture-0.0.0.dist-info/METADATA": (
            b"Metadata-Version: 2.1\nName: xdde-transport-fixture\nVersion: 0.0.0\n"
        ),
        "xdde_transport_fixture-0.0.0.dist-info/WHEEL": (
            b"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n"
        ),
        "xdde_transport_fixture-0.0.0.dist-info/RECORD": b"",
    }
    with zipfile.ZipFile(content, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in files.items():
            entry = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            archive.writestr(entry, data)
    return content.getvalue()


class InterruptedWheelServer(AbstractContextManager):
    def __init__(self, payload, *, corrupt=False):
        self.payload = payload
        self.corrupt = corrupt
        self.requests = []
        self.truncated = False
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                if self.path != "/" + FILENAME:
                    self.send_error(404)
                    return
                selected = self.headers.get("Range")
                start = 0
                if selected:
                    match = re.fullmatch(r"bytes=(\d+)-(\d*)", selected)
                    if not match or not 0 <= int(match[1]) < len(owner.payload):
                        self.send_error(416)
                        return
                    start = int(match[1])
                initial = not owner.truncated and selected is None
                owner.requests.append({"range": selected, "start": start, "truncated": initial})
                self.send_response(206 if selected else 200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "no-store")
                self.send_header("ETag", '"stable-transport-fixture"')
                self.send_header("Content-Length", str(len(owner.payload) - start))
                if selected:
                    self.send_header(
                        "Content-Range",
                        f"bytes {start}-{len(owner.payload) - 1}/{len(owner.payload)}",
                    )
                self.end_headers()
                if initial:
                    owner.truncated = True
                    self.wfile.write(owner.payload[: len(owner.payload) // 3])
                    self.wfile.flush()
                    self.connection.shutdown(socket.SHUT_WR)
                    self.close_connection = True
                    return
                body = bytearray(owner.payload)
                if owner.corrupt:
                    body[len(body) // 2] ^= 1
                self.wfile.write(body[start:])

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_port}/{FILENAME}"

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
