"""Inspect physical output metadata and vectors without changing scientific source data."""

import struct
import xml.etree.ElementTree as ET

from playwright.sync_api import expect


def export_figure(page, trigger, evidence, filename, language, format="PNG"):
    trigger.click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    evidence.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(evidence / (filename + "-choices.png")), full_page=False)
    with page.expect_download(timeout=45000) as download:
        dialog.get_by_role(
            "button", name=("导出 " if language == "zh" else "Export ") + format, exact=True
        ).click()
    path = evidence / (filename + "." + format.lower())
    download.value.save_as(path)
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
