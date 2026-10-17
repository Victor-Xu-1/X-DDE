"""Native cold embedded-editor initialization and focus safety; no scientific jobs."""

import base64
import json
import os
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_hydrogen_policy_browser import non_donor_hydrogens
from server_tests.test_ketcher_depiction_browser import assert_native_bonds
from server_tests.test_navigation_shell_browser import open_navigation


def test_cold_embedded_ketcher_can_initialize_without_taking_user_focus():
    evidence = Path("server_tests/evidence/hydrogen-policy/cold-start")
    evidence.mkdir(parents=True, exist_ok=True)
    errors, warnings, submissions = [], [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: warnings.append(message.text)
            if message.type in {"warning", "error"}
            else None,
        )
        page.on(
            "request",
            lambda request: submissions.append(request.url)
            if request.method == "POST" and request.url.split("?")[0].endswith("/api/jobs")
            else None,
        )

        def cold_component(route):
            # The real script is delayed, not replaced. Parent readiness polling
            # can observe the iframe's body before Ketcher's native initialization.
            time.sleep(21)
            route.continue_()

        page.route("**/tools/ketcher/static/js/main*.js", cold_component)
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            open_navigation(page, "en").get_by_role(
                "button", name="All capabilities", exact=True
            ).click()
            page.locator(".tool-card").get_by_role(
                "heading", name=CAPABILITIES["boltz.predict"].label[1], exact=True
            ).locator("..").click()
            page.get_by_role("button", name="Use this template", exact=True).click()
            picture = page.locator(".molecule-image").first
            picture.scroll_into_view_if_needed()
            search = page.locator("#global-search")
            search.fill("STAT6 source control")
            expect(picture).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            expect(search).to_be_focused()
            expect(search).to_have_value("STAT6 source control")
            image = picture.locator("img")
            url = image.get_attribute("src")
            assert url and url.startswith("data:image/svg+xml;base64,")
            drawing = base64.b64decode(url.split(",", 1)[1])
            assert_native_bonds(drawing)
            display = page.evaluate("""async () => {
                const frame = document.querySelector('.drawing-service-frame');
                const editor = frame.contentWindow.ketcher;
                return {ket: JSON.parse(await editor.getKet()), mol: await editor.getMolfile()};
            }""")
            assert not non_donor_hydrogens(display["ket"])
            assert page.evaluate(
                "document.querySelector('.drawing-service-frame').contentDocument.body.inert"
            )
            assert not submissions
            assert not errors
            (evidence / "native-STAT6-kekule.svg").write_bytes(drawing)
            (evidence / "native-display-copy.mol").write_text(display["mol"])
            (evidence / "acceptance.json").write_text(
                json.dumps(
                    {
                        "real_component_script_delayed_seconds": 21,
                        "declared_drawing_initialization_budget_seconds": 60,
                        "native_svg_ready": True,
                        "source": "Defined STAT6 study small molecule",
                        "source_or_scientific_files_modified": False,
                        "user_focus_retained": True,
                        "private_editor_isolated_after_initialization": True,
                        "scientific_jobs_submitted": submissions,
                    },
                    indent=2,
                )
            )
        finally:
            page.screenshot(path=str(evidence / "result.png"))
            (evidence / "page-errors.json").write_text(json.dumps(errors, indent=2))
            (evidence / "console-warnings.json").write_text(json.dumps(warnings, indent=2))
            browser.close()
