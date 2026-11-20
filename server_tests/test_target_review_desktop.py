"""Replay retained target research and ProTrek results in desktop Chrome."""

import csv
import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import launch_review_browser
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_target_evidence_browser import graphical_workspace  # noqa: F401


def open_example(page, base, tool, zh):
    page.goto(f"{base}/#view=new&tool={tool}")
    page.get_by_role(
        "button", name="示例结果" if zh else "Example results", exact=True,
    ).click()
    return page.locator(".module-template.is-preview")


def first_view(page, locator, min_height=0):
    page.evaluate("window.scrollTo({top: 0, left: 0, behavior: 'instant'})")
    bounds = locator.bounding_box()
    assert bounds and bounds["height"] >= min_height, bounds
    assert bounds["y"] >= 0, bounds
    assert bounds["y"] + bounds["height"] <= page.viewport_size["height"] + 2, bounds
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    return bounds


def verify_target(page, base, zh, evidence):
    pin = page.request.get(base + "/api/examples/discovery.target").json()["pin"]
    native = page.request.get(f"{base}/api/jobs/{pin['job_id']}/result").json()
    first_reference = native["materials"][0]["structures"][0]["id"]
    result = open_example(page, base, "discovery.target", zh)
    result.get_by_role(
        "tab", name="序列与实验结构" if zh else "Sequences & structures",
    ).click()
    materials = result.locator(".target-material-layout")
    sequence = materials.locator(".sequence-track")
    refs = materials.locator(".target-material-references")
    expect(sequence).to_be_visible()
    row = refs.locator("tbody tr").first
    expect(row).to_be_visible()
    assert first_view(page, row)["x"] > first_view(page, sequence, min_height=200)["x"]
    expect(row.get_by_role("link")).to_have_attribute(
        "href", f"https://www.rcsb.org/structure/{first_reference}",
    )
    page.screenshot(path=evidence / "sequence-and-references.png")
    result.get_by_role(
        "tab", name="已有实测活性" if zh else "Reported activities",
    ).click()
    preview = result.locator(".activity-molecule-preview")
    expect(preview.locator(".molecule-image")).to_have_attribute(
        "data-drawing-state", "ready", timeout=45000,
    )
    drawing = first_view(page, preview.locator(".figure-preview-sheet"), min_height=210)
    button = preview.get_by_role("button", name="复制分子结构" if zh else "Copy SMILES")
    expect(button).to_be_in_viewport()
    table = result.locator(".target-activity-workspace table")
    assert result.locator(".target-activity-workspace .research-table-scroll").evaluate(
        "node => node.scrollWidth <= node.clientWidth + 1"
    )
    assert first_view(page, table.locator("tbody tr").first)["x"] > drawing["x"] + drawing["width"]
    page.screenshot(path=evidence / "reported-activity.png")


def verify_structure(page, workspace, zh):
    ready = workspace.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(ready).to_be_enabled(timeout=45000)
    stage = first_view(page, workspace.locator(".molecular-stage iframe"), min_height=330)
    details = workspace.locator(".structure-workbench-details").bounding_box()
    assert stage["width"] >= 490 and details
    assert stage["x"] + stage["width"] < details["x"]


def verify_reference(page, base, zh, evidence):
    pin = page.request.get(base + "/api/examples/discovery.import").json()["pin"]
    result = page.request.get(f"{base}/api/jobs/{pin['job_id']}/result").json()
    workspace = open_example(page, base, "discovery.import", zh)
    verify_structure(page, workspace, zh)
    source = workspace.get_by_role("link", name="下载源文件" if zh else "Download source file")
    expect(source).to_be_in_viewport()
    page.screenshot(path=evidence / "experimental-reference.png")
    with page.expect_download() as transfer:
        source.click()
    assert hashlib.sha256(transfer.value.path().read_bytes()).hexdigest() == result["sha256"]
    if not zh:
        figure = export_figure(
            page, workspace.locator(".viewer-panel .figure-export-trigger"), evidence,
            "experimental-reference", "en",
        )
        inspect_png(figure)


def verify_retrieval(page, base, zh, evidence):
    workspace = open_example(page, base, "protrek-sequence", zh)
    table = workspace.locator(".research-table-scroll")
    row = table.locator("tbody tr").nth(1)
    expect(row).to_be_visible()
    assert table.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    first_view(page, row)
    selected = row.locator("td").first.inner_text().strip()
    row.press("Enter")
    expect(row).to_have_attribute("aria-selected", "true")
    expect(workspace.locator(".sequence-track")).to_have_attribute("aria-label", selected)
    first_view(page, workspace.locator(".sequence-track"), min_height=160)
    page.screenshot(path=evidence / "sequence-retrieval.png")
    expect(table.get_by_role("columnheader")).to_have_count(2)
    with page.expect_download() as transfer:
        workspace.get_by_role(
            "button", name="导出筛选结果" if zh else "Export filtered rows", exact=True,
        ).click()
    with transfer.value.path().open(encoding="utf-8-sig", newline="") as stream:
        records = list(csv.DictReader(stream))
    hidden_metrics = (
        ("全序列一致性 (%)", "对齐区域一致性 (%)", "长度 (aa)") if zh
        else ("Overall identity (%)", "Aligned identity (%)", "Length (aa)")
    )
    assert records[1]["蛋白条目" if zh else "Protein entry"] == selected
    assert all(records[0][label] for label in hidden_metrics)

    workspace = open_example(page, base, "protrek-structure", zh)
    verify_structure(page, workspace, zh)
    table = workspace.locator(".research-table-scroll")
    assert table.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    first_view(page, table.locator("tbody tr").first)
    page.screenshot(path=evidence / "structure-retrieval.png")


@pytest.mark.parametrize("language,width,height", [("en", 1180, 720), ("zh", 1440, 900)])
def test_retained_target_workspaces(target_graphical_workspace, language, width, height):
    evidence = Path("outputs/target-evidence") / f"desktop-{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(target_graphical_workspace.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = launch_review_browser(driver)
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}');"
            "localStorage.setItem('x-dde-theme', 'warm');"
        )
        writes = []

        def collect_write(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.on("request", collect_write)
        zh = language == "zh"
        verify_target(page, base, zh, evidence)
        verify_reference(page, base, zh, evidence)
        verify_retrieval(page, base, zh, evidence)
        assert not writes
        browser.close()
