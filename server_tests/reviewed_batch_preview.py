"""Cold-restored native batch poses, precise scores and both retained quality stages."""

import csv
import hashlib
import re

from example_preview_actions import choose_task, ready_structure
from playwright.sync_api import expect


def review_batch_example(page, base, language, evidence):
    zh = language == "zh"
    choose_task(page, language, "screening.dock")
    detail = page.request.get(base + "/api/examples/screening.dock").json()
    job = detail["pin"]["job_id"]
    assert job == "c3d97cc9-a7ec-401d-a1ed-20c3bbb9404d"
    native = page.request.get(base + "/api/jobs/" + job + "/result").json()
    assert native["counts"] == {"selected": 2, "docked": 2, "failed": 0}
    region = page.get_by_role("region", name="模板的真实结果" if zh else "Actual template result")
    table = region.get_by_role("table", name="候选分子" if zh else "Candidates")
    expect(table.get_by_role("columnheader", name=re.compile("CNN"))).to_be_visible()
    preview = region.locator(".dataset-preview-pane")
    expect(preview.locator(".dataset-panel-title strong")).to_have_text("CHEMBL517122")
    ready_structure(page, zh)
    if page.viewport_size["width"] >= 1000:
        viewport = region.locator(".dataset-candidate-table .research-table-scroll").bounding_box()
        assert viewport
        # A present-but-clipped header cannot qualify as visible score information.
        for column in table.get_by_role("columnheader").all():
            bounds = column.bounding_box()
            assert bounds and bounds["x"] >= viewport["x"] - 1
            assert bounds["x"] + bounds["width"] <= viewport["x"] + viewport["width"] + 1
    # Hidden native model outputs must still be present in the actual browser CSV.
    with page.expect_download() as transfer:
        region.get_by_role(
            "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True
        ).click()
    csv_path = evidence / "batch-native-candidate-scores.csv"
    transfer.value.save_as(csv_path)
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        exported = list(csv.DictReader(stream))
    assert len(exported) == len(native["candidates"]) == 2
    for row, source in zip(exported, native["candidates"], strict=True):
        assert row["成员" if zh else "Member"] == source["display_name"]
        assert row["SMILES"] == source["smiles"]
        for column, key in (
            ("GNINA_kcal_per_mol", "docking_score"),
            ("CNNscore", "cnn_score"),
            ("CNNaffinity_model_output", "cnn_affinity"),
            ("上游筛选分数" if zh else "Upstream screening score", "score"),
        ):
            assert float(row[column]) == source[key]
    table.get_by_role("button", name="CHEMBL512894", exact=True).click()
    expect(preview.locator(".dataset-panel-title strong")).to_have_text("CHEMBL512894")
    ready_structure(page, zh)
    with page.expect_download() as transfer:
        preview.get_by_role(
            "link", name="下载当前结构" if zh else "Download selected structure", exact=True
        ).click()
    sdf = evidence / "batch-CHEMBL512894-native.sdf"
    transfer.value.save_as(sdf)
    assert hashlib.sha256(sdf.read_bytes()).hexdigest() == (
        "065038692aff1629a0414ed6661e282d45ee1fa728071da2579b9910863d6b89"
    )
    preview.get_by_role("tab", name="二维结构" if zh else "2D structure", exact=True).click()
    drawing = preview.locator(".molecule-image:visible")
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    drawing.locator("img").evaluate("image => image.decode()")
    page.screenshot(path=str(evidence / "batch-candidate-2d.png"), full_page=True)
    preview.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
    ready_structure(page, zh)
    table.get_by_role("button", name="CNN 评分" if zh else "CNN score", exact=True).click()
    expect(table.get_by_role("row").nth(1)).to_contain_text("CHEMBL512894")
    table.get_by_role("button", name="CHEMBL517122", exact=True).click()
    expect(preview.locator(".dataset-panel-title strong")).to_have_text("CHEMBL517122")
    ready_structure(page, zh)
    page.screenshot(path=str(evidence / "batch-native-scores-and-pose.png"), full_page=True)
    stages = detail["supporting_stage_names"]
    assert len(stages) == len(set(stages.values())) == 2
    assert "CHEMBL517122" in stages["7e29f874-81a8-4526-8dde-209e4ba03c92"]
    assert "CHEMBL512894" in stages["b00f1296-cf14-4ace-b59a-8aa74bdbf604"]
    select = page.get_by_label("研究阶段结果" if zh else "Study result stage", exact=True)
    for identifier in stages:
        select.select_option(identifier)
        quality = region.get_by_role(
            "region", name="构象与姿势质控结果" if zh else "Pose quality results"
        )
        expect(quality).to_be_visible()
        ready_structure(page, zh)
        expect(quality.locator(".quality-assessment-counts .is-pass")).to_have_text(
            "通过: 15" if zh else "Pass: 15"
        )
        expect(quality.locator(".quality-assessment-counts .is-unassessed")).to_have_text(
            "未评估: 6" if zh else "Not assessed: 6"
        )
        checks = quality.get_by_role(
            "table", name="质控检查结果" if zh else "Quality check outcomes"
        )
        expect(checks.get_by_role("row")).to_have_count(23)
        quality.get_by_role(
            "combobox", name="显示哪些检查？" if zh else "Which checks?", exact=True
        ).select_option("unassessed")
        expect(checks.get_by_role("row")).to_have_count(7)
    page.screenshot(path=str(evidence / "batch-retained-quality.png"), full_page=True)
    return {
        "job": job,
        "members": 2,
        "native_csv_precision": True,
        "selected_sdf_bytes_preserved": True,
        "distinct_quality_stage_names": stages,
        "applicable_pass_count_each": 15,
        "absent_context_not_overclaimed": True,
    }
