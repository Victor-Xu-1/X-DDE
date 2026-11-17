"""Real retained STAT6 graphics continuity; no inference or task submission."""

import hashlib
import json
import os
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.confidence import confidence_view
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.molecular_review_capture import launch_review_browser
from server_tests.native_confidence_case import native_case
from server_tests.test_prediction_workspace_browser import review_prediction_workspace


def observe_updates(plot):
    plot.evaluate("""node => {
        window.confidenceFrameUpdates = [];
        window.confidenceFrameObserver = new MutationObserver(() => {
            window.confidenceFrameUpdates.push({
                busy: node.getAttribute('aria-busy'),
                current: node.getAttribute('data-frame-current'),
                visibility: getComputedStyle(node).visibility
            });
        });
        window.confidenceFrameObserver.observe(node,
            {attributes:true, childList:true, subtree:true});
    }""")


def zoom_matrix(page, matrix, evidence):
    hit = matrix.locator(".nsewdrag")
    hit.scroll_into_view_if_needed()
    plot = matrix.locator(".research-plot-canvas")
    before = hit.bounding_box()
    assert before
    original_hit = plot.evaluate("""(node, box) => {
        const target=document.elementFromPoint(box.x+box.width*.2, box.y+box.height*.2);
        return {className:target?.getAttribute('class'),
            correct:target?.closest('.research-plot-canvas') === node};
    }""", before)
    # Native scrollIntoView does not reserve space for the application's sticky bar.
    plot.evaluate("""node => {
        const header=document.querySelector('.studio-topbar');
        const top=header?.getBoundingClientRect().bottom || 0;
        window.scrollBy({top:node.getBoundingClientRect().top-top-24, behavior:'instant'});
    }""")
    box = hit.bounding_box()
    assert box and box["width"] > 80 and box["height"] > 80
    actual_hits = plot.evaluate("""(node, box) => [.2,.8].map(fraction => {
        const target=document.elementFromPoint(box.x+box.width*fraction,
            box.y+box.height*fraction);
        return {className:target?.getAttribute('class'),
            correct:target?.closest('.research-plot-canvas') === node};
    })""", box)
    (evidence / "zoom-pointer.json").write_text(json.dumps({
        "before": before, "original_hit": original_hit, "after": box, "hits": actual_hits,
    }))
    assert all(row["correct"] for row in actual_hits), actual_hits
    page.mouse.move(box["x"] + box["width"] * .2, box["y"] + box["height"] * .2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * .8,
                    box["y"] + box["height"] * .8, steps=10)
    page.mouse.up()
    page.wait_for_function("""() => {
        const plot=document.querySelector('.confidence-panel .research-plot-canvas');
        return plot?.layout?.xaxis?.autorange === false;
    }""")
    return matrix.locator(".research-plot-canvas").evaluate(
        "node => ({x:node.layout.xaxis.range, y:node.layout.yaxis.range})"
    )


@pytest.mark.parametrize("language,theme,width", [
    ("en", "warm", 1440), ("en", "light", 1440), ("zh", "dark", 390),
    ("en", "warm", 2560),
])
def test_native_confidence_keeps_verified_frames(tmp_path, language, theme, width):
    evidence = Path("outputs/confidence-frame") / f"{language}-{theme}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    identifier, selected = native_case(state, os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    output = state / "jobs" / identifier / "output"
    data = confidence_view(output, selected["artifact"], "pae")
    native = output / data["native_artifact"]
    original = native.read_bytes()
    structure = (output / selected["artifact"]).read_bytes()
    zh = language == "zh"
    errors, writes = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            f"localStorage.setItem('x-dde-theme','{theme}')"
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
        try:
            page.goto(base + "/#task=" + identifier)
            matrix = page.locator(".confidence-panel .research-plot").first
            plot = matrix.locator(".research-plot-canvas")
            expect(plot).to_have_attribute("aria-busy", "false", timeout=60000)
            expect(plot).to_have_attribute("data-frame-current", "true")
            legend = page.locator(".confidence-legend")
            expect(legend).to_be_visible()
            colors = legend.evaluate("""node => {
                const probe=document.createElement('span');
                probe.style.color='var(--muted)'; document.body.append(probe);
                const expected=getComputedStyle(probe).color; probe.remove();
                return {actual:getComputedStyle(node).color, expected};
            }""")
            assert colors["actual"] == colors["expected"]
            sequence = page.get_by_role(
                "region", name="结构中的残基" if zh else "Residues in structure"
            )
            observe_updates(plot)
            first = sequence.get_by_role("checkbox", name=re.compile(r"^A:TRP1 · pLDDT "))
            first.click()
            expect(first).to_have_attribute("aria-checked", "true")
            expect(plot).to_have_attribute("aria-busy", "false")
            expect(matrix.locator(".shapelayer path")).to_have_count(2)
            bounds = zoom_matrix(page, matrix, evidence)
            middle = sequence.get_by_role("checkbox", name=re.compile(r"^A:ALA58 · pLDDT "))
            middle.click()
            expect(middle).to_have_attribute("aria-checked", "true")
            expect(plot).to_have_attribute("aria-busy", "false")
            current_bounds = plot.evaluate(
                "node => ({x:node.layout.xaxis.range, y:node.layout.yaxis.range})"
            )
            assert current_bounds == bounds
            matrix.get_by_role(
                "combobox", name="图表操作" if zh else "Chart interaction"
            ).select_option("pan")
            expect(plot).to_have_attribute("aria-busy", "false")
            updates = page.evaluate("window.confidenceFrameUpdates")
            assert updates and all(row["current"] == "true" and row["visibility"] == "visible"
                                   for row in updates), updates
            page.evaluate("window.confidenceFrameObserver.disconnect()")
            expect(matrix.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓"
            )).to_be_enabled()
            matrix.scroll_into_view_if_needed()
            page.mouse.move(1, 1)
            page.screenshot(path=evidence / "selected-native-workspace.png")
            native_url = page.get_by_role(
                "link", name="下载完整原生置信度" if zh else "Download full native confidence"
            ).get_attribute("href")
            assert native_url
            response = page.request.get(
                base + native_url if native_url.startswith("/") else native_url
            )
            assert response.ok and response.body() == original == native.read_bytes()
            assert structure == (output / selected["artifact"]).read_bytes()
            assert len(Store(state / "jobs.sqlite3").list_jobs(10)) == 1
            engines = page.request.get(base + "/api/runtime-controls").json()["engines"]
            assert not any(row["enabled"] for row in engines)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert not errors and not writes, (errors, writes)
            (evidence / "receipt.json").write_text(json.dumps({
                "job": identifier, "candidate": selected["id"], "chrome": browser.version,
                "language": language, "theme": theme, "width": width,
                "native_sha256": hashlib.sha256(original).hexdigest(),
                "structure_sha256": hashlib.sha256(structure).hexdigest(),
                "legend": colors, "zoom": bounds, "updates": updates,
                "scientific_calculations": 0, "writes": writes,
            }, indent=2))
        except Exception as error:
            failure = {"error": str(error)}
            try:
                page.screenshot(path=evidence / "failure.png")
            except Exception as capture:
                failure["capture_error"] = str(capture)
            (evidence / "failure.json").write_text(json.dumps(failure))
            raise
        finally:
            browser.close()


def test_wide_reference_workspace_retains_canvas_height_and_reachable_controls(tmp_path):
    """Reuse the exact existing 2560px result/input/expansion flow in real Chrome."""
    review_prediction_workspace(tmp_path, "en", 2560, launch_browser=launch_review_browser)
