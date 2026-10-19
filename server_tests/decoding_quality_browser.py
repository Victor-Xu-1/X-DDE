"""Inspect retained decode diagnostics, member paging and actual downloaded scientific bytes."""

import hashlib
import json
import re
import sqlite3

from playwright.sync_api import expect

from server_tests.responsive_chart_browser import wait_for_responsive_width


def check_decoding_quality(page, root, state, identifier, evidence, language):
    output = state / "jobs" / identifier / "output"
    original = json.loads((output / "sequencing-qc.json").read_bytes())
    before = {
        name: hashlib.sha256((output / name).read_bytes()).hexdigest()
        for name in ("sequencing-qc.json", "decoded.sqlite")
    }
    zh = language == "zh"
    quality = root.get_by_role(
        "region", name="UMI 完整性" if zh else "UMI completeness", exact=True
    )
    expect(quality).to_be_visible()
    if original.get("umi_integrity") is None:
        expect(quality).to_contain_text("未评估" if zh else "not assessed")
        expect(quality.get_by_role("table")).to_have_count(0)
    else:
        native = original["umi_integrity"]
        row = quality.get_by_role("row", name=re.compile("长度完整" if zh else "Complete length"))
        expect(row.get_by_role("cell").nth(0)).to_have_text(
            f"{native['reads_by_status']['complete']:,}"
        )
        expect(row.get_by_role("cell").nth(1)).to_have_text(
            f"{native['records_by_status']['complete']:,}"
        )
    length = root.get_by_role(
        "application", name="读段长度分布" if zh else "Read-length distribution", exact=True
    )
    expect(length).to_have_attribute("aria-busy", "false", timeout=30000)
    trace = length.evaluate("el => el.data[0]")
    assert trace["x"] == [row["length"] for row in original["lengths"]]
    assert trace["y"] == [row["reads"] for row in original["lengths"]]
    if original.get("failures"):
        failures = root.get_by_role(
            "application", name="未解码原因" if zh else "Reasons reads were not decoded", exact=True
        )
        expect(failures).to_have_attribute("aria-busy", "false", timeout=30000)
        assert failures.evaluate("el => el.data[0].x") == list(original["failures"].values())
    root.get_by_text("下载研究结果" if zh else "Download results", exact=True).click()
    with page.expect_download() as pending:
        root.get_by_role("link", name=re.compile(r"decode-failures\.csv")).click()
    destination = evidence / (language + "-decode-failures.csv")
    pending.value.save_as(destination)
    assert destination.read_bytes() == (output / "decode-failures.csv").read_bytes()
    root.get_by_role("button", name="结果探索" if zh else "Results", exact=True).click()
    database = sqlite3.connect((output / "decoded.sqlite").as_uri() + "?mode=ro", uri=True)
    try:
        rows = database.execute(
            "SELECT member,sample,umi,count FROM reads "
            "ORDER BY count DESC,sample,library,member,umi LIMIT 20"
        ).fetchall()
        table = root.get_by_role("table")
        expect(table.locator("tbody tr")).to_have_count(len(rows))
        first = table.locator("tbody tr").first
        expect(first.get_by_role("cell").nth(0)).to_have_text(rows[0][0])
        expect(first.get_by_role("cell").nth(2)).to_have_text(rows[0][2] or "—")
        if original.get("umi_integrity") is None:
            expect(first.get_by_role("cell").nth(5)).to_have_text("—")
            expect(first.get_by_role("cell").nth(6)).to_have_text(
                "完整性未评估" if zh else "Not assessed"
            )
        search = root.get_by_role(
            "searchbox", name="搜索成员或货号" if zh else "Search members or IDs"
        )
        search.fill(rows[0][0])
        matching = database.execute(
            "SELECT COUNT(*) FROM reads WHERE member=?", (rows[0][0],)
        ).fetchone()[0]
        expect(table.locator("tbody tr")).to_have_count(min(20, matching))
        expect(table.locator("tbody tr").first.get_by_role("cell").nth(0)).to_have_text(rows[0][0])
        search.fill("nonexistent-del-member-xyz")
        expect(
            root.get_by_text(
                "当前筛选条件下没有成员" if zh else "No members match the current criteria",
                exact=True,
            )
        ).to_be_visible()
        search.fill("")
        expect(table.locator("tbody tr")).to_have_count(len(rows))
        page.set_viewport_size({"width": 390, "height": 844})
        table.scroll_into_view_if_needed()
        wait_for_responsive_width(page)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(evidence / (language + "-decoded-members-mobile.png")))
        page.set_viewport_size({"width": 1440, "height": 1000})
    finally:
        database.close()
    root.get_by_role(
        "button", name="图表与质量" if zh else "Charts and quality", exact=True
    ).click()
    assert before == {
        name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in before
    }
