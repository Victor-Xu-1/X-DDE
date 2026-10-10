"""Inspect physical output metadata and vectors without changing scientific source data."""

import hashlib
import json
import struct
import xml.etree.ElementTree as ET

from playwright.sync_api import expect


def export_figure(page, trigger, evidence, filename, language, format="PNG", configure=None):
    trigger.click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    if configure:
        configure(dialog)
    evidence.mkdir(parents=True, exist_ok=True)
    messages = []
    page.on(
        "console",
        lambda message: (
            messages.append(message.text) if message.type in {"error", "warning"} else None
        ),
    )
    try:
        image = dialog.locator(".figure-preview-sheet img")
        expect(image).to_be_visible(timeout=45000)
        export = dialog.get_by_role(
            "button", name=("导出 " if language == "zh" else "Export ") + format, exact=True
        )
        expect(export).to_be_enabled(timeout=45000)
        preview = image.evaluate("""async image => {
          if (!image.complete || !(image.naturalWidth > 0)) throw Error('Preview not decoded');
          const source = /^data:(image\/(?:png|svg\+xml));base64,(.+)$/.exec(image.src);
          if (!source) throw Error('Expected the existing CSP-compatible image transport');
          const bytes = Uint8Array.from(atob(source[2]), char => char.charCodeAt(0));
          const hash = await crypto.subtle.digest('SHA-256', bytes);
          const sha256 = Array.from(new Uint8Array(hash))
            .map(n => n.toString(16).padStart(2,'0')).join('');
          return {sha256,
            width: image.naturalWidth, height: image.naturalHeight, bytes: bytes.byteLength};
        }""")
        page.screenshot(path=str(evidence / (filename + "-choices.png")), full_page=False)
        with page.expect_download(timeout=45000) as download:
            export.click()
    except Exception:
        page.screenshot(path=str(evidence / (filename + "-failure.png")), full_page=False)
        (evidence / (filename + "-failure.json")).write_text(
            json.dumps({"messages": messages, "dialog": dialog.inner_text()}, ensure_ascii=False),
            encoding="utf-8",
        )
        raise
    path = evidence / (filename + "." + format.lower())
    download.value.save_as(path)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == preview["sha256"], (
        "The downloaded native figure differs from the decoded preview"
    )
    (evidence / (filename + "-preview.json")).write_text(
        json.dumps(preview, indent=2), encoding="utf-8"
    )
    expect(dialog).to_have_count(0)
    return path


def inspect_png(path, dpi=600, width=2102):
    data = path.read_bytes()
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert struct.unpack(">I", data[16:20])[0] == width
    chunks = {}
    offset = 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunks[data[offset + 4 : offset + 8]] = data[offset + 8 : offset + 8 + length]
        offset += length + 12
    x, y, unit = struct.unpack(">IIB", chunks[b"pHYs"])
    assert (x, y, unit) == (round(dpi / 0.0254), round(dpi / 0.0254), 1)
    assert len(data) > 10000, "A blank/corrupt image must not qualify as a structure export"


def inspect_svg(path, measured_text):
    root = ET.fromstring(path.read_bytes())
    assert root.attrib["width"] == "89mm"
    assert measured_text in " ".join(root.itertext())
    assert root.findall(".//{http://www.w3.org/2000/svg}path")
    texts = root.findall(".//{http://www.w3.org/2000/svg}text")
    assert texts
    view_width = float(root.attrib["viewBox"].split()[2])
    for text in texts:
        assert abs(float(text.attrib["font-size"]) * (89 / 25.4 * 72) / view_width - 7) < 1e-6
