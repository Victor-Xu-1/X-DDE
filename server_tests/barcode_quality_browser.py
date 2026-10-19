"""Compare the visible barcode table and its CSV with the original native artifact."""

import csv
import json

from playwright.sync_api import expect


def check_barcode_quality(page, root, state, identifier, evidence, language):
    original = json.loads((state / "jobs" / identifier / "output/barcode-review.json").read_bytes())
    name = "Barcode and structure checks" if language == "en" else "条码区分与结构检查"
    table = root.get_by_role("table", name=name, exact=True)
    expect(table).to_be_visible()
    for cycle in original["cycles"]:
        row = table.get_by_role("row").filter(has=page.get_by_role("rowheader", name=cycle["set"]))
        expect(row).to_be_visible()
        distance = cycle.get("minimum_observed_hamming_distance")
        expect(row.get_by_role("cell").nth(1)).to_have_text(
            "—" if distance is None else str(distance)
        )
    with page.expect_download() as pending:
        root.get_by_role(
            "button", name="Export checks" if language == "en" else "导出质控表"
        ).click()
    destination = evidence / (language + "-native-barcode-checks.csv")
    pending.value.save_as(destination)
    with destination.open(encoding="utf-8-sig", newline="") as stream:
        exported = list(csv.DictReader(stream))
    assert len(exported) == len(original["cycles"])
    for recorded, cycle in zip(exported, original["cycles"], strict=True):
        assert recorded.pop("dataset_job") == identifier
        for key, value in recorded.items():
            native = cycle.get(key)
            expected = (
                ""
                if native is None
                else json.dumps(native)
                if isinstance(native, bool)
                else str(native)
            )
            assert value == expected, (key, value, expected)
    page.set_viewport_size({"width": 390, "height": 844})
    table.scroll_into_view_if_needed()
    expect(table).to_be_visible()
    page.screenshot(path=str(evidence / (language + "-barcode-quality-mobile.png")))
    widths = page.evaluate("""() => ({width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll('body *')).map(el => ({
        tag: el.tagName, class: String(el.className), right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width, scroll: el.scrollWidth
      })).filter(el => el.right > innerWidth + 1).slice(0, 30)})""")
    (evidence / (language + "-barcode-mobile-bounds.json")).write_text(json.dumps(widths))
    assert widths["scroll"] <= widths["width"] + 1, widths
    page.set_viewport_size({"width": 1440, "height": 1000})
