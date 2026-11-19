"""Use retained native STAT6 results to check both desktop protein review pages."""

import hashlib
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

EVIDENCE = Path("outputs/protein-review-desktop")


def verify_layout(workspace, frame, width, height):
    canvas = frame.bounding_box()
    right = workspace.locator(".spatial-result-summary").bounding_box()
    assert canvas and right
    assert canvas["width"] >= 560 and canvas["height"] >= 460
    assert canvas["x"] + canvas["width"] < right["x"]
    assert 0 < canvas["y"] < 345 and right["x"] + right["width"] <= width
    files = workspace.locator(".spatial-summary-downloads").bounding_box()
    assert files and 0 <= files["y"] and files["y"] + files["height"] <= height


def verify_downloads(page, workspace, digests):
    links = workspace.locator(".spatial-summary-downloads a")
    expect(links).to_have_count(4)
    expected = set(digests)
    for link in links.all():
        url = link.get_attribute("href")
        artifact = parse_qs(urlparse(url).query)["name"][0]
        expected.remove(artifact)
        expect(link).to_be_in_viewport(ratio=1)
        with page.expect_download() as transfer:
            link.click()
        actual = hashlib.sha256(transfer.value.path().read_bytes()).hexdigest()
        assert actual == digests[artifact]
    assert not expected


def check_comparison(workspace, zh):
    plot = workspace.get_by_role("tab", name="位移图" if zh else "Plot", exact=True)
    residues = workspace.get_by_role("tab", name="残基表" if zh else "Residues", exact=True)
    plot.press("ArrowRight")
    expect(residues).to_have_attribute("aria-selected", "true")
    row = workspace.locator(".research-table tbody tr").nth(6)
    row.press("Enter")
    expect(row).to_have_attribute("aria-selected", "true")
    expect(workspace.locator(".comparison-preview-context output")).to_contain_text("→")
    expect(workspace.get_by_role("status").filter(
        has_text="已定位区域残基" if zh else "Region residues located"
    )).to_contain_text("2 / 2", timeout=15000)
    residues.press("ArrowLeft")
    expect(plot).to_have_attribute("aria-selected", "true")
    expect(workspace.locator(".js-plotly-plot")).to_be_visible(timeout=15000)


def check_interface(workspace, zh):
    table = workspace.locator(".research-table-scroll")
    expect(table.locator("tbody tr").first).to_be_in_viewport(ratio=0.75)
    assert table.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    workspace.get_by_role("searchbox").fill("A:PTR641")
    row = workspace.get_by_role("row").filter(has_text="A:PTR641").filter(has_text="B:ARG562")
    partner = row.get_by_role("button", name=re.compile("B:ARG562$"))
    target = row.get_by_role("button", name=re.compile("A:PTR641$"))
    partner.evaluate("node => node.scrollIntoView({block:'center', inline:'nearest'})")
    partner.click()
    selected = workspace.get_by_role(
        "group", name="当前结构选择" if zh else "Current structure selection"
    )
    expect(selected.get_by_text("B:ARG562", exact=True)).to_be_visible()
    expect(partner).to_have_attribute("aria-pressed", "true")
    target.press("Enter")
    expect(selected.get_by_text("A:PTR641", exact=True)).to_be_visible()
    assert table.evaluate("node => node.scrollWidth <= node.clientWidth + 1")


def verify_expanded_help(page, workspace, frame, capability, zh):
    language = {
        "rmsd": ("结构比较的解释", "Interpreting structural comparisons"),
        "structure": ("作用与距离说明", "Interpreting contacts and distances"),
    }
    workspace.get_by_role(
        "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True,
    ).click()
    dialog = workspace.get_by_role("dialog")
    expect(dialog).to_have_attribute("data-workspace-expanded", "true")
    help_button = dialog.get_by_role("button", name=language[capability][0 if zh else 1])
    before = frame.element_handle()
    help_button.press("Enter")
    identity = help_button.get_attribute("aria-describedby")
    tip = dialog.locator(f'[id="{identity}"]')
    expect(tip).to_be_in_viewport(ratio=1)
    expect(tip).to_contain_text("亲和力" if zh else "affinity")
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    assert frame.evaluate("(node, previous) => node === previous", before)


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1280, 720),
    ("zh", "dark", 1600, 900),
])
def test_retained_protein_desktop_workspaces(language, theme, width, height):
    settings = Settings.from_env()
    evidence = EVIDENCE / f"{language}-{theme}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes = []

        def record(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.context.on("request", record)
        power = base + "/api/runtime-controls?include_native=false"
        before = page.request.get(power).json()
        for capability, selector in (
            ("rmsd", ".comparison-result-view"),
            ("structure", ".protein-interface-results"),
        ):
            pin = page.request.get(f"{base}/api/examples/{capability}?profile=stat6").json()["pin"]
            identifier = pin["job_id"]
            native = page.request.get(f"{base}/api/jobs/{identifier}/result").json()
            digests = native["artifact_sha256"]
            if capability == "rmsd":
                digests = {key: digest for key, digest in digests.items() if "-source." not in key}
            page.goto(f"{base}/?review={capability}#task={identifier}")
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            workspace = page.locator(selector)
            frame = workspace.locator(".molecular-stage iframe")
            capture = workspace.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
            )
            expect(capture).to_be_enabled(timeout=35000)
            verify_layout(workspace, frame, width, height)
            page.screenshot(path=evidence / f"{capability}-workspace.png")
            original = frame.element_handle()
            verify_downloads(page, workspace, digests)
            if capability == "rmsd":
                check_comparison(workspace, zh)
            else:
                check_interface(workspace, zh)
            assert frame.evaluate("(node, previous) => node === previous", original)
            verify_expanded_help(page, workspace, frame, capability, zh)
            if not zh:
                path = export_figure(
                    page, workspace.locator(".viewer-panel .figure-export-trigger"),
                    evidence, capability, language,
                )
                inspect_png(path)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert not writes and page.request.get(power).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()
