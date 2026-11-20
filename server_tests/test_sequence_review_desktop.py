"""Check native STAT6 sequence result workspaces with retained outputs only."""

import hashlib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

EVIDENCE = Path("outputs/sequence-review-desktop")


def open_retained(page, base, capability):
    info = page.request.get(f"{base}/api/examples/{capability}?profile=stat6").json()
    job = info["pin"]["job_id"]
    native = page.request.get(f"{base}/api/jobs/{job}/result").json()
    page.goto(f"{base}/#task={job}")
    result = page.locator(".sequence-review-workspace")
    expect(result.locator(".research-table tbody tr").first).to_be_visible()
    return result, native, job


def check_layout(result, width, height):
    view = result.locator(".structure-workbench-view").bounding_box()
    rail = result.locator(".sequence-review-summary").bounding_box()
    table = result.locator(".research-table-scroll")
    assert view and rail and view["x"] + view["width"] < rail["x"]
    assert view["width"] >= (490 if width == 1180 else 585)
    assert rail["x"] + rail["width"] <= width
    row = table.locator("tbody tr").first.bounding_box()
    assert row and row["y"] + row["height"] <= height
    assert table.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    toolbar = result.locator(".research-table-toolbar").bounding_box()
    assert toolbar and toolbar["height"] <= 72


def verify_native(page, base, language, width, height, evidence):
    zh = language == "zh"
    result, native, _ = open_retained(page, base, "ligandmpnn.design")
    canvas = result.locator(".molecular-stage iframe")
    ready = result.get_by_role(
        "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
    )
    expect(ready).to_be_enabled(timeout=30000)
    check_layout(result, width, height)
    bounds = canvas.bounding_box()
    assert bounds and bounds["width"] >= (490 if width == 1180 else 585)
    if height <= 840:
        assert bounds["height"] >= 345 and bounds["y"] + bounds["height"] <= height + 2
    else:
        assert bounds["height"] >= 500
    page.screenshot(path=evidence / "ligandmpnn.png")
    second = native["candidates"][1]
    result.get_by_role("button", name=second["id"], exact=True).click()
    links = result.locator(".sequence-review-downloads a")
    files = [second["artifact"], "designed-sequences.fasta", "sequences.csv"]
    expect(links).to_have_count(len(files))
    for element, name in zip(links.all(), files, strict=True):
        expect(element).to_be_in_viewport()
        with page.expect_download() as event:
            element.click()
        assert hashlib.sha256(event.value.path().read_bytes()).hexdigest() == (
            native["artifact_sha256"][name]
        )
    frame = canvas.element_handle()
    result.get_by_role("tab", name="序列" if zh else "Sequence", exact=True).click()
    expect(result.locator(".sequence-display pre")).to_contain_text(second["sequence"][:60])
    result.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
    assert canvas.evaluate("(node, previous) => node === previous", frame)
    expect(ready).to_be_enabled(timeout=30000)
    if not zh and width == 1280:
        path = export_figure(
            page, result.locator(".viewer-panel .figure-export-trigger"),
            evidence, "ligandmpnn-structure", language,
        )
        inspect_png(path)


def verify_sequence(page, base, language, width, height, evidence):
    zh = language == "zh"
    result, native, job = open_retained(page, base, "mpnn")
    check_layout(result, width, height)
    table = result.get_by_role("table", name="序列候选" if zh else "Sequence candidates")
    expect(table).to_be_visible()
    expect(result.locator(".molecular-stage iframe")).to_have_count(0)
    second = "候选 2" if zh else "Candidate 2"
    table.get_by_role("button", name=second, exact=True).click()
    expect(result.locator(".sequence-result-heading h3")).to_have_text(second)
    chain = result.locator(".candidate-chain-view").first
    sequence = chain.locator(".sequence-track")
    expect(sequence).to_have_count(1)
    candidate = native["result"]["candidates"][1]["sequence"]
    parent = page.request.get(f"{base}/api/jobs/{job}").json()["request"]["payload"]
    original = parent["parent_chains"]["A"]
    substitutions = [
        (index, f"{before}{index}{after}")
        for index, (before, after) in enumerate(zip(original, candidate, strict=True), start=1)
        if before != after
    ]
    changes = chain.locator(".candidate-chain-changes button")
    expect(changes).to_have_count(len(substitutions))
    index, label = substitutions[0]
    expect(changes.first).to_have_text(label)
    expect(changes.first).to_be_in_viewport()
    changes.first.click()
    residue = sequence.locator(f'[data-position="{index}"]')
    expect(residue).to_have_attribute("aria-pressed", "true")
    expect(residue).to_contain_text(candidate[index - 1])
    fasta = sequence.get_by_role(
        "button", name="下载此序列 FASTA" if zh else "Download this sequence FASTA",
    )
    with page.expect_download() as event:
        fasta.click()
    lines = event.value.path().read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith(">") and "".join(lines[1:]) == candidate
    chain.get_by_role("button", name="原始" if zh else "Original", exact=True).click()
    expect(sequence).to_have_count(1)
    expect(residue).to_have_attribute("aria-pressed", "true")
    expect(residue).to_contain_text(original[index - 1])
    with page.expect_download() as event:
        fasta.click()
    lines = event.value.path().read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith(">") and "".join(lines[1:]) == original
    chain.get_by_role("button", name="候选" if zh else "Candidate", exact=True).click()
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=evidence / "solublempnn.png")


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1180, 720),
    ("en", "warm", 1280, 720),
    ("zh", "dark", 1600, 900),
])
def test_retained_sequence_workspaces(language, theme, width, height):
    settings = Settings.from_env()
    evidence = EVIDENCE / f"{language}-{theme}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        mutations = []

        def record(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                mutations.append(request.url)

        page.context.on("request", record)
        url = base + "/api/runtime-controls?include_native=false"
        before = page.request.get(url).json()
        verify_native(page, base, language, width, height, evidence)
        verify_sequence(page, base, language, width, height, evidence)
        expect(page.locator("html")).to_have_attribute("data-theme", theme)
        assert not mutations and page.request.get(url).json() == before
        assert all(not item["enabled"] and not item["active"] for item in before["engines"])
        browser.close()
