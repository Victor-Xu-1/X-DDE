"""Real retained STAT6 result tabs across resize; no engine or scientific execution."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401


@pytest.fixture(scope="module")
def tab_workspace(interaction_workspace):
    subprocess.run(
        [sys.executable, "server_tests/prepare_visual_components.py", "--components", "ketcher"],
        check=True,
    )
    return interaction_workspace


def visible_selection(page, track):
    page.wait_for_function(
        """track => {
          const tab = track.querySelector('[role="tab"][aria-selected="true"]');
          if (!tab) return false;
          const a = track.getBoundingClientRect(), b = tab.getBoundingClientRect();
          return b.left >= a.left + track.clientLeft - 1 &&
            b.right <= a.left + track.clientLeft + track.clientWidth + 1;
        }""",
        arg=track.element_handle(),
    )


@pytest.mark.parametrize("language", ["en", "zh"])
def test_retained_target_tabs_reveal_resize_keyboard_and_native_content(tab_workspace, language):
    evidence = Path("outputs/research-tabs") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with platform(tab_workspace.state_dir, evidence / "platform.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', {json.dumps(language)})"
            )
            errors, writes = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None,
            )
            pin = page.request.get(base + "/api/examples/discovery.target").json()["pin"]
            assert pin and pin["case_id"] == "stat6-defined-molecules"
            result_url = base + f"/api/jobs/{pin['job_id']}/result"
            native = page.request.get(result_url).body()
            jobs = page.request.get(base + "/api/jobs").json()
            runtime = page.request.get(base + "/api/runtime-controls").json()
            assert not any(engine["enabled"] for engine in runtime["engines"])
            page.goto(base + "/#task=" + pin["job_id"])
            track = page.get_by_role(
                "tablist", name="靶点研究结果" if zh else "Target research results", exact=True
            )
            activities = track.get_by_role(
                "tab", name="已有实测活性" if zh else "Reported activities"
            )
            activities.click()
            search = page.get_by_role(
                "searchbox",
                name="搜索 · 已有实测活性" if zh else "Search · Reported activities",
                exact=True,
            )
            search.fill("CHEMBL226930")
            drawing = page.get_by_role(
                "region", name="选中记录的分子结构" if zh else "Selected reported molecule"
            ).locator(".molecule-image:not(.is-thumbnail)")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            image = drawing.get_by_role("img").element_handle()
            assert image
            search.focus()
            page_position = page.evaluate("({x:scrollX,y:scrollY})")
            page.emulate_media(reduced_motion="reduce")
            page.set_viewport_size({"width": 390, "height": 1000})
            visible_selection(page, track)
            expect(activities).to_have_attribute("aria-selected", "true")
            expect(search).to_be_focused()
            assert image.evaluate("node => node.isConnected")
            expect(search).to_have_value("CHEMBL226930")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            geometry = track.evaluate("""node => ({
              track: node.getBoundingClientRect().toJSON(), scrollLeft: node.scrollLeft,
              selected: node.querySelector('[aria-selected="true"]')
                .getBoundingClientRect().toJSON(),
              targets: [...node.querySelectorAll('[role="tab"]')]
                .map(tab=>tab.getBoundingClientRect().height),
              pageScroll: {x:scrollX,y:scrollY}
            })""")
            assert min(geometry["targets"]) >= 44
            page.screenshot(path=evidence / "selected-mobile.png")
            # End/Home and wrapping arrows retain the visited native image and input.
            activities.focus()
            activities.press("End")
            visible_selection(page, track)
            expect(track.get_by_role("tab").last).to_be_focused()
            track.get_by_role("tab").last.press("ArrowRight")
            visible_selection(page, track)
            expect(track.get_by_role("tab").first).to_be_focused()
            track.get_by_role("tab").first.press("End")
            track.get_by_role("tab").last.press("ArrowLeft")
            visible_selection(page, track)
            expect(activities).to_be_focused()
            expect(search).to_have_value("CHEMBL226930")
            assert image.evaluate("node => node.isConnected")
            assert drawing.get_by_role("img").evaluate(
                "(node, original) => node === original", image
            )
            page.set_viewport_size({"width": 1440, "height": 1000})
            visible_selection(page, track)
            expect(activities).to_be_focused()
            expect(search).to_have_value("CHEMBL226930")
            page.screenshot(path=evidence / "selected-desktop.png")
            assert page.request.get(result_url).body() == native
            assert page.request.get(base + "/api/jobs").json() == jobs
            final_runtime = page.request.get(base + "/api/runtime-controls").json()
            assert not any(engine["enabled"] for engine in final_runtime["engines"])
            assert not errors and not writes, (errors, writes)
            (evidence / "acceptance.json").write_text(json.dumps({
                "language": language, "native_job": pin["job_id"], "geometry": geometry,
                "page_scroll_before_resize": page_position,
                "native_image_retained": True, "edited_filter_retained": True,
                "keyboard_and_focus": True, "scientific_writes": writes, "page_errors": errors,
            }, indent=2))
            browser.close()
