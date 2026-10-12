"""Exact native residue probabilities and OAS windows, with downloadable precision."""

import csv
import io
from pathlib import Path

import pytest
from playwright.sync_api import expect

from server_tests.test_sequence_results_browser import native_case, result_page  # noqa: F401


@pytest.mark.parametrize("index", [0, 1])
def test_native_reference_details_and_downloads(request, index):
    page = request.getfixturevalue("result_page")
    report, _ = native_case(page, "antibody.humanize")
    row = report["rows"][index]
    panel = page.locator(".humanization-results")
    panel.get_by_role("combobox", name="查看哪条序列？").select_option(str(index))
    chart = panel.get_by_role("application", name="原始残基的模型概率 · Sapiens")
    expect(chart.locator("svg.main-svg").first).to_be_visible(timeout=30000)
    panel.get_by_text("逐位概率与导出", exact=True).click()
    table = panel.get_by_role("region", name="原始残基概率", exact=True)
    with page.expect_download() as pending:
        table.get_by_role("button", name="导出筛选结果", exact=True).click()
    target = Path("server_tests/evidence/sequence-results") / f"residue-probabilities-{index}.csv"
    pending.value.save_as(target)
    records = list(csv.DictReader(io.StringIO(target.read_text(encoding="utf-8-sig"))))
    assert len(records) == len(row["source_sequence"])
    for record, residue in zip(records, row["numbering"], strict=True):
        position = residue["source_position"]
        assert int(record["原始位置"]) == position
        assert (
            float(record["原始残基概率"])
            == row["original_scores"][position - 1][residue["amino_acid"]]
        )
        for aa in "ACDEFGHIKLMNPQRSTVWY":
            assert float(record[f"P({aa})"]) == row["original_scores"][position - 1][aa]
    table.locator("tbody tr").first.click()
    expect(panel.locator(".sequence-alignment footer")).to_contain_text("位置 1")
    panel.get_by_text("OAS 肽段匹配与导出", exact=True).click()
    peptides = panel.get_by_role("region", name="原始序列的 OAS 肽段", exact=True)
    with page.expect_download() as pending:
        peptides.get_by_role("button", name="导出筛选结果", exact=True).click()
    target = target.with_name(f"oas-peptides-{index}.csv")
    pending.value.save_as(target)
    records = list(csv.DictReader(io.StringIO(target.read_text(encoding="utf-8-sig"))))
    assert len(records) == len(row["original_evaluation"]["peptides"])
    for record, peptide in zip(records, row["original_evaluation"]["peptides"], strict=True):
        assert record["九肽"] == peptide["sequence"]
        assert record["参考中存在"] == str(peptide["matched"]).lower()
