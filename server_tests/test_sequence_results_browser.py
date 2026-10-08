"""Inspect four frozen public results and their exports without scientific execution."""

import csv
import hashlib
import io
import json
import os
from pathlib import Path

import pytest
from layout_browser_helpers import catalog
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/sequence-results")


@pytest.fixture
def result_page():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(os.environ["WB_BROWSER_URL"])
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        yield page
        assert not errors, errors
        assert not submissions, "Result inspection submitted computation or installation"
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()


def native_case(page, capability, label):
    base = os.environ["WB_BROWSER_URL"]
    example = page.request.get(base + "/api/examples/" + capability).json()
    assert example["computed_result_available"] and example["pin"]
    job_id = example["pin"]["job_id"]
    hashes = {}
    for name, expected in example["pin"]["artifact_sha256"].items():
        data = page.request.get(base + f"/api/jobs/{job_id}/download", params={"name": name}).body()
        assert hashlib.sha256(data).hexdigest() == expected
        hashes[name] = expected
    catalog(page)
    page.get_by_role("button", name=label, exact=True).and_(page.locator(".tool-card")).click()
    page.locator(".module-template:visible").get_by_role(
        "button", name="示例结果", exact=True
    ).click()
    expect(page.get_by_role("region", name="模块内示例结果", exact=True)).to_be_visible()
    report = page.request.get(base + f"/api/jobs/{job_id}/result").json()
    job = page.request.get(base + "/api/jobs/" + job_id).json()
    (EVIDENCE / (capability + "-native-identity.json")).write_text(
        json.dumps({"job_id": job_id, "artifact_sha256": hashes}, indent=2)
    )
    return report, job


def capture_views(page, panel, name):
    measurements = []
    for width in (1440, 1331, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        panel.locator(".result-inspection").scroll_into_view_if_needed()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        left = panel.locator(".result-inspection-list").bounding_box()
        right = panel.locator(".result-inspection-detail").bounding_box()
        assert left and right
        if width > 1000:
            assert left["x"] + left["width"] <= right["x"] and abs(left["y"] - right["y"]) <= 3
        else:
            assert left["y"] + left["height"] <= right["y"]
        measurements.append({"width": width, "list": left, "detail": right})
        page.screenshot(path=EVIDENCE / f"{name}-{width}.png")
    (EVIDENCE / f"{name}-layout.json").write_text(json.dumps(measurements, indent=2))
    page.set_viewport_size({"width": 1440, "height": 1000})


def english(page):
    page.get_by_role("button", name="设置与帮助", exact=True).click()
    page.get_by_role("menuitem", name="界面设置", exact=True).click()
    page.locator("#settings-language").select_option("en")
    page.get_by_role("navigation", name="Main navigation").get_by_role(
        "button", name="Biologics research", exact=True
    ).click()


def download(page, control, name):
    with page.expect_download(timeout=30000) as event:
        control.click()
    path = EVIDENCE / name
    event.value.save_as(path)
    return path.read_bytes()


def test_native_sequence_scores_select_and_export_exact_inputs(result_page):
    page = result_page
    report, job = native_case(page, "esm", "蛋白序列评分")
    panel = page.locator(".sequence-score-results")
    table = panel.get_by_role("table", name="输入序列评分", exact=True)
    expect(table.get_by_role("button", name="序列 2", exact=True)).to_be_visible()
    table.get_by_role("button", name="序列 2", exact=True).click()
    sequence = job["request"]["payload"]["sequences"][1]
    expect(panel.get_by_role("region", name="序列 2", exact=True)).to_have_count(1)
    raw = download(
        page, panel.get_by_role("button", name="下载此序列 FASTA", exact=True), "scored-input.fasta"
    )
    assert "".join(raw.decode().splitlines()[1:]) == sequence
    raw = download(
        page,
        panel.get_by_role("button", name="导出筛选结果", exact=True),
        "native-sequence-scores.csv",
    )
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    assert [float(row["模型分数"]) for row in rows] == report["result"]["scores"]
    capture_views(page, panel, "sequence-scores-zh")
    english(page)
    page.get_by_role("combobox", name="Research task", exact=True).select_option(
        label="Score protein sequences"
    )
    page.get_by_role("button", name="Example results", exact=True).click()
    expect(page.locator(".sequence-score-results")).to_be_visible()
    capture_views(page, page.locator(".sequence-score-results"), "sequence-scores-en")


def test_native_antibody_cdrs_use_full_source_positions_and_exact_domain_files(result_page):
    page = result_page
    report, job = native_case(page, "antibody.number", "抗体编号与 CDR 标注")
    panel = page.locator(".antibody-number-results")
    first = report["domains"][0]
    cdr = next(row for row in first["numbering"] if row["region"] == "CDR3")
    source = next(
        row["sequence"] for row in report["input_records"] if row["id"] == first["source_id"]
    )
    panel.get_by_role("table", name="CDR 区域", exact=True).get_by_role(
        "button", name="CDR3", exact=True
    ).click()
    expect(panel.locator(".sequence-track footer")).to_contain_text(
        f"序列位置 {cdr['source_position']} · {cdr['amino_acid']} · CDR3"
    )
    raw = download(
        page,
        panel.get_by_role("button", name="下载此序列 FASTA", exact=True),
        "numbering-full-input.fasta",
    )
    assert "".join(raw.decode().splitlines()[1:]) == source
    raw = download(
        page,
        panel.get_by_role("link", name="下载这个域的序列", exact=True),
        "numbered-variable-domain.fasta",
    )
    assert hashlib.sha256(raw).hexdigest() == first["sha256"]
    panel.get_by_text("完整 IMGT 编号", exact=True).click()
    insertion = next((row for row in first["numbering"] if row["insertion"]), None)
    if insertion:
        expect(
            panel.get_by_role(
                "cell", name=f"{insertion['number']}{insertion['insertion']}", exact=True
            )
        ).to_be_visible()
    panel.get_by_text("完整 IMGT 编号", exact=True).click()
    capture_views(page, panel, "antibody-numbering-zh")
    panel.get_by_role("combobox", name="查看哪个输入/结构域？", exact=True).select_option("1")
    expect(panel.locator(".sequence-track footer")).not_to_contain_text("序列位置")
    english(page)
    page.get_by_role("combobox", name="Research task", exact=True).select_option(
        label="Antibody numbering and CDR annotation"
    )
    page.get_by_role("button", name="Example results", exact=True).click()
    capture_views(page, page.locator(".antibody-number-results"), "antibody-numbering-en")


def test_native_reference_metrics_and_source_alignment_remain_scientifically_distinct(result_page):
    page = result_page
    report, job = native_case(page, "antibody.humanize", "抗体人源参考与框架优化")
    panel = page.locator(".humanization-results")
    row = report["rows"][0]
    assert row["status"] == "evaluated" and row["proposal"] is None
    metrics = panel.get_by_role("table", name="同一条序列的参考评估", exact=True)
    expect(metrics.locator("thead th")).to_have_count(2)
    expect(
        metrics.get_by_text(
            f"{row['original_evaluation']['mean_native_residue_probability']:.4f}", exact=True
        )
    ).to_be_visible()
    expect(panel.get_by_text("本次只评估，未修改原始序列。", exact=True)).to_be_visible()
    residue = row["numbering"][0]
    panel.get_by_role(
        "button", name=f"原始 · {residue['source_position']} · {residue['amino_acid']}", exact=True
    ).click()
    expect(panel.locator(".sequence-alignment footer")).to_contain_text(
        f"IMGT {residue['number']}{residue['insertion']}"
    )
    capture_views(page, panel, "human-reference-zh")
    english(page)
    page.get_by_role("button", name="Example results", exact=True).click()
    capture_views(page, page.locator(".humanization-results"), "human-reference-en")


def test_native_quality_checks_stay_visible_beside_unmodified_3d_files(result_page):
    page = result_page
    report, job = native_case(page, "posebusters.check", "构象与姿势质控")
    panel = page.get_by_role("region", name="构象与姿势质控结果", exact=True)
    expect(panel.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
        timeout=30000
    )
    expect(
        panel.get_by_role("table", name="质控检查结果", exact=True).locator("tbody tr")
    ).to_have_count(len(report["checks"]))
    for name in report["previews_sha256"]:
        raw = page.request.get(
            os.environ["WB_BROWSER_URL"] + f"/api/jobs/{job['id']}/download", params={"name": name}
        ).body()
        assert hashlib.sha256(raw).hexdigest() == report["previews_sha256"][name]
    capture_views(page, panel, "pose-quality-zh")
    english(page)
    page.get_by_role("navigation", name="Main navigation").get_by_role(
        "button", name="Pockets and docking", exact=True
    ).click()
    page.get_by_role("combobox", name="Research task", exact=True).select_option(
        label="Conformation and pose quality"
    )
    page.get_by_role("button", name="Example results", exact=True).click()
    panel = page.get_by_role("region", name="Pose quality results", exact=True)
    expect(panel.get_by_role("button", name="Capture 3D view", exact=True)).to_be_enabled(
        timeout=30000
    )
    capture_views(page, panel, "pose-quality-en")
