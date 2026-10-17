"""Actual frozen disease evidence, bounded counts and precise browser CSV exports."""

import csv

from playwright.sync_api import expect
from test_navigation_shell_browser import open_navigation


def review_disease_example(page, base, language, evidence):
    zh = language == "zh"
    open_navigation(page, language).get_by_role(
        "button", name="靶点研究" if zh else "Target research", exact=True
    ).click()
    page.locator(".module-task-picker select:visible").select_option("discovery.disease")
    page.locator(".module-template:visible").get_by_role(
        "button", name="示例结果" if zh else "Example results", exact=True
    ).click()
    region = page.get_by_role("region", name="模板的真实结果" if zh else "Actual template result")
    expect(region).to_be_visible()
    detail = page.request.get(base + "/api/examples/discovery.disease").json()
    identifier = detail["pin"]["job_id"]
    assert identifier == "0ea187a3-59ac-4478-96d2-c29f72168c1f"
    native = page.request.get(base + "/api/jobs/" + identifier + "/result").json()
    expected = native["entity"]["associatedTargets"]["rows"]
    facts = region.locator(".result-summary-grid dd")
    expect(facts).to_have_count(2)
    expect(facts.nth(0)).to_have_text("7772")
    expect(facts.nth(1)).to_have_text("50")
    assert not region.get_by_role("tablist").count()
    table = region.get_by_role("table", name="关联证据" if zh else "Association evidence")
    search = region.get_by_role(
        "searchbox", name="搜索 · 关联证据" if zh else "Search · Association evidence"
    )
    search.fill("STAT6")
    expect(table.get_by_role("row")).to_have_count(1)
    expect(facts.nth(0)).to_have_text("7772")
    search.fill("IL4R")
    expect(table.get_by_role("row")).to_have_count(2)
    search.fill("")
    with page.expect_download() as transfer:
        region.get_by_role(
            "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
        ).click()
    file = evidence / "asthma-source-associations.csv"
    transfer.value.save_as(file)
    with file.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len(expected) == 50
    for row, source in zip(rows, expected, strict=True):
        assert row["研究对象" if zh else "Entity"] == source["target"]["approvedSymbol"]
        assert row["下一步" if zh else "Next step"] == source["target"]["id"]
        assert float(row["关联分数" if zh else "Association score"]) == source["score"]
    page.screenshot(path=str(evidence / "asthma-associations.png"), full_page=True)
    return {
        "retained": 50,
        "source_total": 7772,
        "stat6_not_in_retained_subset": True,
        "native_score_precision_preserved": True,
        "unrequested_molecular_sections_omitted": True,
    }
