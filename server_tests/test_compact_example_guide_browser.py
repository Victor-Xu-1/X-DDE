"""Inspect actual retained examples without running or preparing a task."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401


@pytest.mark.parametrize("tool,lang,width,height,engine", [
    ("chemistry.states", "en", 320, 568, "chemistry"),
    ("plip.profile", "zh", 390, 775, "plip"),
    ("boltz.predict", "en", 1440, 900, "boltz"),
])
def test_saved_case_guide_keeps_source_current_and_the_view_in_reach(
    interaction_workspace, tool, lang, width, height, engine
):
    evidence = Path("outputs/compact-example") / tool
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": width, "height": height})
            page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{lang}')")
            zh = lang == "zh"
            writes = []
            page.on("request", lambda req: writes.append(req.url)
                    if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
            pin = page.request.get(base + f"/api/examples/{tool}").json()["pin"]
            root = page.request.get(base + f"/api/jobs/{pin['job_id']}").json()
            jobs = page.request.get(base + "/api/jobs").json()
            if tool == "chemistry.states":
                page.goto(base + "/#view=utilities")
                page.get_by_role("button", name="Protonation & tautomers", exact=True).click()
            else:
                page.goto(base + "/#view=new&tool=" + tool)
            template = page.locator(".module-template:not([hidden] *)")
            open_result = template.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            )
            open_result.click()
            header = template.locator(".example-preview-toolbar")
            guide = header.get_by_label("模板说明与来源" if zh else "Template guide & sources")
            source = header.locator(".example-result-source")
            scene = template.locator(".module-example-result .molecular-stage:visible")
            expect(scene.locator(".viewer-tools")).to_be_visible(timeout=30000)
            expect(header.locator(f'[data-engine="{engine}"] [role="switch"]')).not_to_be_checked()
            expect(source).not_to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if tool == "chemistry.states":
                assert scene.evaluate("""e => {
                    const r = e.getBoundingClientRect();
                    return r.top + r.height / 2 < innerHeight - 12;
                }""")
            page.screenshot(path=evidence / "first-view.png")
            guide.press("Enter")
            expect(source).to_contain_text(root["request"]["name"])
            if tool == "boltz.predict":
                expect(source).to_contain_text("Boltz-2")
            guide.press("Escape")
            expect(source).not_to_be_visible()
            expect(guide).to_be_focused()
            if tool == "chemistry.states":
                plot = template.locator(".research-plot-canvas")
                expect(plot.locator("svg.main-svg").first).to_be_attached(timeout=30000)
                page.set_viewport_size({"width": 390, "height": height})
                page.set_viewport_size({"width": width, "height": height})
                assert template.evaluate("e => e.scrollWidth <= e.clientWidth + 1")
                page.wait_for_function("""() => {
                    const plot = document.querySelector(
                        '.module-template.is-preview .research-plot-canvas');
                    const svg = plot?.querySelector('svg.main-svg');
                    return svg &&
                        Math.abs(svg.getBoundingClientRect().width - plot.clientWidth) < 2;
                }""")
                chart = template.locator(".research-plot")
                chart.get_by_role("combobox", name="Chart interaction").select_option("pan")
                page.wait_for_function("""() =>
                    document.querySelector('.module-template.is-preview .research-plot-canvas')
                        ?._fullLayout?.dragmode === 'pan'
                """)
                chart.locator(".figure-export-trigger").click()
                export = page.locator(".figure-export-dialog footer button")
                expect(export).to_be_enabled(timeout=30000)
                with page.expect_download() as transfer:
                    export.click()
                svg_file = evidence / "conformer-energies.svg"
                transfer.value.save_as(svg_file)
                assert b"<svg" in svg_file.read_bytes()
            if tool == "boltz.predict":
                followup = pin["supporting_evidence"][0]["job_id"]
                job = page.request.get(base + f"/api/jobs/{followup}").json()
                template.get_by_role("button", name="Next study stage", exact=True).click()
                expect(header.locator('[data-engine="plip"] [role="switch"]')).to_be_visible()
                guide.click()
                expect(source).to_contain_text(job["request"]["name"])
                expect(source).not_to_contain_text(root["request"]["name"])
                guide.press("Escape")
                template.get_by_role("button", name="Previous study stage", exact=True).click()
                expect(header.locator('[data-engine="boltz"] [role="switch"]')).to_be_visible()
            header.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(open_result).to_be_focused()
            assert page.request.get(base + "/api/jobs").json() == jobs
            assert writes == []
            browser.close()
