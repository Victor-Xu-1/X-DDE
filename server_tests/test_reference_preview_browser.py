"""Native archive bytes, explicit preparation and linked 2D/3D views in Chrome."""

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.reference_archive_replay import configure_replay
from server_tests.test_frontend_browser import contrast_ratio
from server_tests.test_ketcher_depiction_browser import assert_native_bonds
from server_tests.test_ketcher_startup_browser import (
    test_cold_embedded_ketcher_can_initialize_without_taking_user_focus as cold_depiction,
)


@pytest.fixture(scope="module")
def reference_workspace(interaction_workspace):
    settings = interaction_workspace
    subprocess.run(
        [sys.executable, "server_tests/prepare_visual_components.py", "--components", "ketcher"],
        env={**os.environ, "WB_HOME": str(settings.state_dir.parent),
             "WB_STATE_DIR": str(settings.state_dir)}, check=True,
    )
    return settings


def source_bytes(page, base, job, result):
    url = base + f"/api/jobs/{job}/download?name=" + quote(result["artifact"], safe="")
    response = page.request.get(url)
    assert response.ok
    original = response.body()
    assert hashlib.sha256(original).hexdigest() == result["sha256"]
    assert result["reference"]["sha256"] == result["sha256"]
    return url, original


def frame_below_header(page, frame):
    # Ordinary document scrolling leaves the molecular camera and coordinates intact.
    frame.evaluate("node => { const y=node.getBoundingClientRect().top; "
                   "const bar=document.querySelector('.studio-topbar'); "
                   "window.scrollBy(0,y-(bar?.getBoundingClientRect().bottom||0)-12); }")


def capture_failure_layout(page, workspace, evidence, phase):
    """Recovery stays near the message instead of below an empty healthy-size canvas."""
    page.evaluate("window.scrollTo(0,0)")
    bounds = workspace.locator(".structure-workbench-view").bounding_box()
    assert bounds and bounds["height"] <= 500, bounds
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.screenshot(path=evidence / f"{phase}.png")
    return bounds


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
@pytest.mark.parametrize("kind", ["structure", "molecule"])
def test_native_reference_workspace(reference_workspace, language, width, kind,
                                    tmp_path, monkeypatch):
    evidence = Path("outputs/reference-preview") / f"{kind}-{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, writes = [], []
    replay_log = (
        configure_replay(monkeypatch, tmp_path / "archive-replay")
        if kind == "molecule" else None
    )
    with platform(reference_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(
                f"if(location.origin==={json.dumps(base)}){{"
                f"localStorage.setItem('opendde-workbench.language','{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            before_import = None
            try:
                if kind == "molecule":
                    token = page.request.get(base + "/api/session").json()["csrf_token"]
                    auth = {"X-Workbench-CSRF": token}
                    enabled = page.request.post(
                        base + "/api/runtime-controls/discovery/start", headers=auth, data={}
                    )
                    assert enabled.ok, enabled.text()
                    page.goto(base + "/#view=new&tool=discovery.import")
                    form = page.locator(".questionnaire:visible")
                    form.get_by_role("radio", name="已知化合物" if zh else "Known compound",
                                     exact=True).check()
                    forward = form.get_by_role(
                        "button", name="下一步" if zh else "Next", exact=True
                    )
                    forward.click()
                    form.get_by_role("textbox", name=(
                        "ChEMBL 化合物编号" if zh else "ChEMBL molecule accession"
                    )).fill("CHEMBL376085")
                    forward.click()
                    forward.click()
                    form.get_by_role("checkbox").check()
                    before_import = page.request.get(base + "/api/jobs").json()
                    form.get_by_role("button", name=("导入研究材料" if zh else
                                                    "Import research material"), exact=True).click()
                    workspace = page.locator(".reference-import-results")
                    expect(workspace).to_be_visible(timeout=160000)
                    after_import = page.request.get(base + "/api/jobs").json()
                    imported = [row for row in after_import
                                if row["id"] not in {old["id"] for old in before_import}]
                    assert len(imported) == 1
                    job = imported[0]["id"]
                    result = page.request.get(base + f"/api/jobs/{job}/result").json()
                    assert result["identifier"] == "CHEMBL376085"
                    replay_events = [json.loads(line)
                                     for line in replay_log.read_text().splitlines()]
                    calls = [call for call in replay_events
                             if call["mode"] == "sealed_official_response"]
                    assert [call["url"] for call in calls] == [
                        "https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL376085" + suffix
                        for suffix in (".json", ".sdf")
                    ]
                    launches = [call for call in replay_events
                                if call["mode"] == "native_importer_process"]
                    assert len(launches) == 1
                    process = launches[0]
                    assert process["runner"] == "runner.py"
                    assert process["job"] == job
                    assert {call["pid"] for call in calls} == {process["pid"]}
                    (evidence / "archive-transport.json").write_text(
                        json.dumps(replay_events, indent=2)
                    )
                    assert result["preparation"] == (
                        "original_archive_bytes_not_prepared_or_bound_pose"
                    )
                    assert page.request.post(base + "/api/runtime-controls/discovery/stop",
                                             headers=auth, data={}).ok
                else:
                    pin = page.request.get(base + "/api/examples/discovery.import").json()["pin"]
                    assert pin
                    job = pin["job_id"]
                    result = page.request.get(base + f"/api/jobs/{job}/result").json()
                    assert result["identifier"] == "9BIG" and result["request"]["format"] == "cif"

                url, original = source_bytes(page, base, job, result)
                assert result["kind"] == kind
                before_preview = page.request.get(base + "/api/jobs").json()
                page.on("request", lambda req: writes.append(req.url)
                        if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
                fault = re.compile(re.escape(url) + "$")
                source_reads = []
                page.on("request", lambda req: source_reads.append(req.url)
                        if req.url == url and req.method == "GET" else None)
                altered = original + (
                    b"\n# preview transport fault\n" if kind == "structure" else b"\n"
                )
                page.route(fault, lambda route: route.fulfill(status=200, body=altered))
                page.goto(base + f"/#task={job}")
                # Reload an already-open imported task so verification sees this transport.
                page.reload()
                workspace = page.locator(".reference-import-results")
                expect(workspace).to_be_visible(timeout=20000)
                panel = workspace.locator(
                    ".viewer-panel" if kind == "structure" else ".molecule-image"
                )
                if kind == "structure":
                    expect(panel.locator(".viewer-error")).to_be_visible(timeout=40000)
                else:
                    expect(panel).to_have_attribute(
                        "data-drawing-state", "unavailable", timeout=60000
                    )
                    expect(panel.get_by_role("img")).to_have_count(0)
                next_step = workspace.get_by_role("button", name=(
                    "准备研究结构" if zh else "Prepare research structure"
                ) if kind == "structure" else (
                    "准备分子" if zh else "Prepare molecule"
                ), exact=True)
                expect(next_step).to_be_disabled()
                mismatch_bounds = capture_failure_layout(
                    page, workspace, evidence, "source-mismatch",
                )
                page.unroute(fault)
                source_read_count = None
                if kind == "molecule":
                    source_reads.clear()
                    workspace.get_by_role("button", name=(
                        "重新核验源文件" if zh else "Retry source verification"
                    ), exact=True).click()
                    # Native bytes, not display readiness, authorize preparation.
                    expect(next_step).to_be_enabled(timeout=30000)
                else:
                    panel.get_by_role("button", name="重新加载" if zh else "Reload").click()
                expect(next_step).to_be_enabled(timeout=60000)
                if kind == "structure":
                    frame = panel.locator("iframe")
                    expect(panel.locator(".viewer-error")).to_have_count(0)
                    figure = export_figure(
                        page, panel.get_by_role(
                            "button", name="文献图导出 ↓" if zh else "Export figure ↓"
                        ), evidence, "native-structure", language,
                    )
                    inspect_png(figure)
                else:
                    expect(panel.locator("iframe")).to_have_count(0)
                    frame = panel.locator(".figure-preview-sheet")
                    expect(panel).to_have_attribute("data-drawing-state", "ready", timeout=60000)
                    image = panel.get_by_role("img", name=(
                        "二维分子结构 · " if zh else "2D molecular structure · "
                    ) + result["identifier"], exact=True)
                    expect(image).to_be_visible()
                    source_read_count = len(source_reads)
                    assert source_read_count == 1, source_reads
                    drawing = base64.b64decode(image.get_attribute("src").split(",", 1)[1])
                    assert_native_bonds(drawing)
                    assert b"CH3" not in drawing
                    (evidence / "native-molecule.svg").write_bytes(drawing)
                    export_figure(page, panel.get_by_role("button", name="文献图导出 ↓" if zh else
                                                         "Export figure ↓"), evidence,
                                  "native-molecule-print", language, format="SVG")
                    assert b"  2D" in original and b"CHEMBL376085" in original
                page.mouse.move(1, 1)
                expect(page.get_by_role("tooltip")).to_have_count(0)
                page.evaluate("window.scrollTo(0,0)")
                page.screenshot(path=evidence / "overview.png")
                frame_below_header(page, frame)
                bounds = frame.bounding_box()
                details = workspace.locator(".structure-workbench-details").bounding_box()
                assert bounds and details and bounds["height"] >= 250
                if width > 1000:
                    assert bounds["x"] < details["x"] and bounds["width"] > details["width"]
                    working = workspace.locator(".structure-workbench").bounding_box()
                    assert working and bounds["width"] >= working["width"] * 0.67
                else:
                    assert details["y"] >= bounds["y"] + bounds["height"]
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                expect(page.locator(".module-task-picker:visible")).to_have_count(0)
                page.screenshot(path=evidence / "workspace.png")
                with page.expect_download() as transfer:
                    workspace.get_by_role("link", name="下载源文件" if zh else
                                          "Download source file", exact=True).click()
                saved = evidence / result["artifact"]
                transfer.value.save_as(saved)
                assert saved.read_bytes() == original
                next_step.click()
                expect(page.locator(".questionnaire:visible")).to_be_visible()
                expect(page.locator(".reference-import-results")).to_have_count(0)
                page.get_by_role("button", name="返回参考材料" if zh else
                                 "Back to reference material", exact=True).click()
                expect(page.locator(".reference-import-results")).to_be_visible()
                unavailable_bounds, alternate_bounds, paper_colors = None, None, None
                themes_checked = [page.locator("html").get_attribute("data-theme")]
                if kind == "molecule":
                    # Fault only the optional display-component status; preserve real SDF bytes.
                    def without_drawing_component(route):
                        response = route.fetch()
                        status = response.json()
                        status.get("installed", {}).pop("ketcher", None)
                        route.fulfill(response=response, json=status)

                    page.route("**/api/deployment", without_drawing_component)
                    page.reload()
                    expect(workspace).to_be_visible(timeout=20000)
                    expect(panel).to_have_attribute(
                        "data-drawing-state", "unavailable", timeout=60000
                    )
                    expect(next_step).to_be_enabled(timeout=30000)
                    unavailable_bounds = capture_failure_layout(
                        page, workspace, evidence, "drawing-unavailable-source-valid",
                    )
                    alternate = "dark" if language == "en" else "light"
                    page.evaluate("theme => localStorage.setItem('x-dde-theme', theme)", alternate)
                    page.reload()
                    expect(page.locator("html")).to_have_attribute("data-theme", alternate)
                    expect(panel).to_have_attribute(
                        "data-drawing-state", "unavailable", timeout=60000,
                    )
                    expect(next_step).to_be_enabled(timeout=30000)
                    alternate_bounds = capture_failure_layout(
                        page, workspace, evidence, f"drawing-unavailable-{alternate}-source-valid",
                    )
                    message = panel.locator(".figure-preview-image-space > span")
                    expect(message).to_have_text("二维图暂不可用" if zh else "2D unavailable")
                    paper_colors = panel.locator(".figure-preview-sheet").evaluate("""node => {
                      const style = getComputedStyle(node);
                      const root = node.closest('.molecule-image');
                      const message = node.querySelector('.figure-preview-image-space > span');
                      return {foreground: getComputedStyle(message).color,
                        message: message.textContent, background: style.backgroundColor,
                        controls_foreground: getComputedStyle(
                          root.querySelector('.molecule-drawing-style')).color,
                        controls_background: getComputedStyle(root).backgroundColor};
                    }""")
                    assert contrast_ratio(
                        paper_colors["foreground"], paper_colors["background"],
                    ) >= 4.5, paper_colors
                    assert contrast_ratio(
                        paper_colors["controls_foreground"], paper_colors["controls_background"],
                    ) >= 4.5, paper_colors
                    themes_checked.append(alternate)
                    next_step.click()
                    expect(page.locator(".questionnaire:visible")).to_be_visible()
                    page.get_by_role("button", name="返回参考材料" if zh else
                                     "Back to reference material", exact=True).click()
                    page.unroute("**/api/deployment", without_drawing_component)
                if kind == "structure":
                    page.goto(base + "/#view=new&tool=discovery.import")
                    expect(page.locator(".module-task-picker:visible")).to_have_count(1)
                    page.get_by_role("button", name="示例结果" if zh else "Example results",
                                     exact=True).click()
                    expect(page.locator(".reference-import-results")).to_be_visible()
                    expect(page.locator(".module-task-picker:visible")).to_have_count(0)
                    page.get_by_role("button", name="返回任务填写" if zh else "Return to task form",
                                     exact=True).click()
                    expect(page.locator(".module-task-picker:visible")).to_have_count(1)
                assert page.request.get(url).body() == original
                assert page.request.get(base + "/api/jobs").json() == before_preview
                assert not writes and not errors, (writes, errors)
                engines = page.request.get(base + "/api/runtime-controls").json()["engines"]
                assert not any(row["enabled"] for row in engines)
                (evidence / "receipt.json").write_text(json.dumps({
                    "job": job, "kind": kind, "identifier": result["identifier"],
                    "source_sha256": result["sha256"], "chrome": browser.version,
                    "language": language, "width": width,
                    "archive_retrieval_jobs": int(kind == "molecule"),
                    "live_network_retrieval_jobs": 0,
                    "archive_transport": ("sealed_official_responses" if kind == "molecule"
                                          else "retained_STAT6_archive"),
                    "scientific_calculations": 0, "preview_writes": writes,
                    "source_mismatch_recovered": True, "source_bytes_unchanged": True,
                    "optional_drawing_failure_allows_preparation": kind == "molecule",
                    "source_mismatch_bounds": mismatch_bounds,
                    "drawing_unavailable_bounds": unavailable_bounds,
                    "alternate_failure_bounds": alternate_bounds,
                    "failure_themes_checked": themes_checked, "paper_colors": paper_colors,
                    "source_read_count_before_drawing": source_read_count,
                    "canvas_bounds": bounds, "details_bounds": details,
                }, indent=2))
            finally:
                if before_import is not None:
                    previous = {row["id"] for row in before_import}
                    imports = [row for row in page.request.get(base + "/api/jobs").json()
                               if row["id"] not in previous]
                    (evidence / "import-jobs.json").write_text(json.dumps(imports, indent=2))
                    for imported in imports:
                        log = page.request.get(base + f"/api/jobs/{imported['id']}/logs")
                        (evidence / f"import-{imported['id']}.log").write_text(log.text())
                page.screenshot(path=evidence / "last-state.png")
                browser.close()


def test_existing_default_depiction_is_unchanged(reference_workspace, monkeypatch):
    evidence = Path("outputs/reference-preview/default-depiction")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(reference_workspace.state_dir, evidence / "service.log") as base:
        monkeypatch.setenv("WB_BROWSER_URL", base)
        cold_depiction()
