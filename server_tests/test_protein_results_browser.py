"""Native protein result layouts and downloads; frozen cases, no scientific execution."""

import csv
import io
import json
import os
from pathlib import Path

import pytest
from layout_browser_helpers import catalog
from playwright.sync_api import expect, sync_playwright


@pytest.fixture
def protein_page():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and "/api/examples/" not in request.url
                else None
            ),
        )
        page.goto(os.environ["WB_BROWSER_URL"])
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        yield page, evidence
        assert not errors, errors
        assert not submissions, "A result inspection must never submit computation"
        assert before == page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        browser.close()


def open_result(page, name, configuration=False):
    catalog(page)
    page.get_by_role("button", name=name, exact=True).and_(page.locator(".tool-card")).click()
    page.get_by_role("button", name="配置示例" if configuration else "示例结果", exact=True).click()
    expect(page.get_by_role("region", name="模块内示例结果", exact=True)).to_be_visible(
        timeout=30000
    )


def capture(page, root, name):
    assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
    page.screenshot(path=str(root / (name + ".png")))


def download(page, control, root, name):
    with page.expect_download(timeout=30000) as event:
        control.click()
    destination = root / name
    event.value.save_as(destination)
    return destination.read_bytes()


def test_fold_has_one_explicit_candidate_structure_and_reachable_sequence(protein_page):
    page, root = protein_page
    open_result(page, "结合体折叠与界面评分")
    panel = page.locator(".sequence-candidate-results")
    expect(panel.get_by_role("tab", name="三维结构", exact=True)).to_have_attribute(
        "aria-selected", "true"
    )
    expect(panel.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
        timeout=30000
    )
    expect(page.locator(".viewer-panel:visible")).to_have_count(1)
    expect(
        page.locator(".operation-results > details > summary").filter(has_text="三维结构")
    ).to_have_count(0)
    expect(panel.get_by_role("heading", name="Rb-H2-6LBX", exact=True)).to_be_visible()
    expect(panel.locator("thead th")).to_have_count(4)
    for width in (1440, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        capture(page, root, f"protein-fold-structure-{width}")
    page.set_viewport_size({"width": 1440, "height": 1000})
    panel.get_by_role("tab", name="序列对照", exact=True).click()
    expect(panel.locator(".sequence-track:visible")).to_have_count(1)
    fasta = download(
        page,
        panel.get_by_role("button", name="下载此序列 FASTA", exact=True),
        root,
        "fold-native-binder.fasta",
    )
    assert len("".join(fasta.decode().splitlines()[1:])) == 275
    capture(page, root, "protein-fold-sequence")


def test_comparison_compact_metrics_preserve_raw_values_and_input_boundaries(protein_page):
    page, root = protein_page
    open_result(page, "对齐目标后比较结合姿势")
    panel = page.get_by_role("region", name="结构比较结果", exact=True)
    expect(panel.get_by_text("97", exact=True)).to_be_visible()
    expect(panel.get_by_text("275", exact=True)).to_be_visible()
    expect(panel.get_by_text("37.1693", exact=False)).to_be_visible()
    expect(
        panel.get_by_text("下方为原始输入；本次结果未提供可核验的叠合结构。", exact=True)
    ).to_be_visible()
    expect(panel.locator(".viewer-panel")).to_have_count(2)
    for control in panel.get_by_role("button", name="生成三维视图图片", exact=True).all():
        expect(control).to_be_enabled(timeout=30000)
    raw = download(
        page,
        panel.get_by_role("button", name="下载指标", exact=True),
        root,
        "native-structure-comparison.csv",
    )
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    assert rows == [
        {"metric": "rmsd", "value": "37.16928545636545", "unit": "Å"},
        {"metric": "matched_target_atoms", "value": "97", "unit": ""},
        {"metric": "matched_binder_atoms", "value": "275", "unit": ""},
    ]
    for width in (1440, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        capture(page, root, f"protein-comparison-{width}")
        if width == 1440:
            assert panel.locator(".paired-structure-views").bounding_box()["y"] < 600
    assert panel.get_by_role("link", name="下载此结构", exact=True).count() == 2


def test_campaign_template_previews_exact_inputs_without_generating_a_design(protein_page):
    page, root = protein_page
    open_result(page, "抗体设计与 CDR 优化", configuration=True)
    panel = page.locator(".campaign-case-preview")
    expect(panel.get_by_text("输入模板 · 设计尚未运行", exact=True)).to_be_visible()
    expect(panel.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
        timeout=30000
    )
    expect(
        panel.get_by_role("table", name="研究材料", exact=True).locator("tbody tr")
    ).to_have_count(3)
    capture(page, root, "campaign-target-reference")
    panel.get_by_role("button", name="抗体可变域 · 输入链 B", exact=True).click()
    expect(panel.get_by_role("button", name="生成三维视图图片", exact=True)).to_be_enabled(
        timeout=30000
    )
    panel.get_by_role("tab", name="序列与 CDR", exact=True).click()
    expect(panel.locator(".sequence-track")).to_be_visible()
    expect(panel.locator(".sequence-region-map button")).to_have_count(3)
    raw = download(
        page,
        panel.get_by_role("button", name="下载此序列 FASTA", exact=True),
        root,
        "campaign-heavy-variable.fasta",
    )
    sequence = "".join(raw.decode().splitlines()[1:])
    assert len(sequence) == 120 and sequence.startswith("EVQL")
    for width in (1440, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        capture(page, root, f"campaign-sequence-cdr-{width}")
    panel.get_by_role("button", name="抗体可变域 · 输入链 A", exact=True).click()
    panel.get_by_role("tab", name="序列与 CDR", exact=True).click()
    raw = download(
        page,
        panel.get_by_role("button", name="下载此序列 FASTA", exact=True),
        root,
        "campaign-light-variable.fasta",
    )
    assert len("".join(raw.decode().splitlines()[1:])) == 107
    (root / "protein-results-review.json").write_text(
        json.dumps(
            {
                "revision": os.environ.get("GITHUB_SHA"),
                "no_scientific_inference": True,
                "heavy_variable_length": 120,
                "light_variable_length": 107,
            },
            indent=2,
        )
    )
