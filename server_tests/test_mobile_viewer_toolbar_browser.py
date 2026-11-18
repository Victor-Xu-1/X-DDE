"""Exercise compact controls on a retained original structure with the actual viewer."""

import re
from hashlib import sha256
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.publication_browser_helpers import export_figure, inspect_png


def test_compact_native_viewer_keeps_camera_controls_and_export(interaction_workspace):
    evidence = Path("outputs/compact-native-viewer")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 390, "height": 775})
            page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
            writes = []
            page.on(
                "request",
                lambda request: writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} else None,
            )
            case = page.request.get(base + "/api/examples/discovery.import").json()
            pin = case["pin"]
            artifact = page.request.get(base + f"/api/jobs/{pin['job_id']}/result").json()
            jobs = page.request.get(base + "/api/jobs").json()
            page.goto(base + "/#view=new&tool=discovery.import")
            page.get_by_role("button", name="Example results", exact=True).click()
            panel = page.locator(".reference-import-results .viewer-panel")
            stage = panel.locator(".molecular-stage")
            iframe = stage.locator("iframe")
            zoom = stage.get_by_role("button", name="Zoom in", exact=True)
            expect(zoom).to_be_visible(timeout=30000)
            files_label = "Structure files and resolution"
            picture_tools = panel.get_by_role(
                "button", name=files_label, exact=True, include_hidden=True,
            )
            display_tools = panel.get_by_role("button", name="Display options", exact=True)
            expect(picture_tools).to_have_attribute("aria-expanded", "false")
            expect(display_tools).to_have_attribute("aria-expanded", "false")
            assert stage.bounding_box()["y"] < 500
            page.screenshot(path=evidence / "first-view-390.png")

            original_handle = iframe.element_handle()
            camera = "f => f.contentWindow.document.querySelector('canvas')._3dmol_viewer.getView()"
            coordinates = """f => f.contentWindow.document.querySelector('canvas')
                ._3dmol_viewer.getModel(0).selectedAtoms({})
                .map(atom => [atom.index, atom.x, atom.y, atom.z])"""
            initial_positions = iframe.evaluate(coordinates)
            assert len(initial_positions) > 100
            previous = iframe.evaluate(camera)
            zoom.click()
            page.wait_for_function(
                """old => JSON.stringify(document.querySelector('.reference-import-results iframe')
                    .contentWindow.document.querySelector('canvas')._3dmol_viewer.getView())
                    !== JSON.stringify(old)""",
                arg=previous,
            )

            for label in ("Backbone", "Ligand and pocket", "Surface", "Ligand and pocket"):
                mode = panel.get_by_role("button", name=label, exact=True)
                mode.click()
                expect(mode).to_have_attribute("aria-pressed", "true")
            display_tools.press("Enter")
            display = panel.get_by_role("group", name="Display options", exact=True)
            expect(display).to_be_visible()
            page.screenshot(path=evidence / "display-tools-390.png")
            expect(display.get_by_label("All atoms", exact=True)).to_be_visible()
            display_tools.press("Escape")
            expect(display_tools).to_be_focused()
            expect(display).not_to_be_visible()
            chains = panel.locator(".viewer-chain-menu summary")
            chains.click()
            panel.get_by_role("button", name=re.compile("^Focus chain ")).first.click()
            chains.click()
            assert iframe.evaluate(coordinates) == initial_positions
            assert iframe.evaluate("(frame, original) => frame === original", original_handle)

            picture_tools.click()
            tools = panel.get_by_role("group", name=files_label, exact=True)
            bounds = tools.bounding_box()
            assert 0 <= bounds["x"] and bounds["x"] + bounds["width"] <= 390
            scale = tools.get_by_role("combobox", name="3D image resolution", exact=True)
            scale.select_option("3")
            tools.locator(".viewer-original-downloads summary").click()
            with page.expect_download() as transfer:
                tools.get_by_role("link", name="Structure 1", exact=True).click()
            original = evidence / "original-structure"
            transfer.value.save_as(original)
            digest = sha256(original.read_bytes()).hexdigest()
            assert digest == artifact["sha256"] == pin["artifact_sha256"][artifact["artifact"]]
            tools.locator(".viewer-original-downloads summary").click()

            def configure(dialog):
                dialog.get_by_role("combobox", name="Panel layout").select_option("landscape")
                dialog.get_by_role("combobox", name="Resolution", exact=True).select_option("300")

            view = iframe.evaluate(camera)
            figure = panel.get_by_role("button", name="Export figure ↓", exact=True)
            png = export_figure(
                page, figure,
                evidence, "archived-structure", "en", configure=configure,
            )
            inspect_png(png, dpi=300, width=1051)
            assert iframe.evaluate(camera) == view
            expect(figure).to_be_focused()

            page.set_viewport_size({"width": 320, "height": 680})
            expect(picture_tools).to_be_visible()
            expect(display_tools).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            for label in ("Backbone", "Ligand and pocket", "Surface"):
                expect(panel.get_by_role("button", name=label, exact=True)).to_be_visible()
            page.screenshot(path=evidence / "narrow-view-320.png")
            picture_tools.click()
            scale.focus()
            page.set_viewport_size({"width": 1440, "height": 900})
            expect(picture_tools).not_to_be_visible()
            expect(picture_tools).to_have_attribute("aria-expanded", "false")
            expect(scale).to_have_value("3")
            expect(scale).to_be_focused()
            scale.press("Escape")
            expect(scale).to_be_focused()
            expect(figure).to_be_visible()
            assert iframe.evaluate("(frame, original) => frame === original", original_handle)
            assert iframe.evaluate(coordinates) == initial_positions
            page.screenshot(path=evidence / "desktop.png")
            assert page.request.get(base + "/api/jobs").json() == jobs
            assert writes == []
            browser.close()


def test_archived_result_consumers_keep_narrow_controls(interaction_workspace):
    evidence = Path("outputs/compact-native-viewer")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, evidence / "consumers.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 320, "height": 680})
            page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
            jobs = page.request.get(base + "/api/jobs").json()
            for capability, region in (
                ("biopython.prepare", ".prepared-structure-workspace"),
                ("chemistry.states", ".state-native-preview"),
                ("boltz.predict", ".prediction-result"),
            ):
                pin = page.request.get(base + f"/api/examples/{capability}").json()["pin"]
                page.goto(base + f"/#task={pin['job_id']}")
                preview = page.locator(region)
                expect(preview.locator(".molecular-stage iframe")).to_be_visible(timeout=30000)
                if capability == "chemistry.states":
                    tools = preview.get_by_role("button", name="View tools", exact=True)
                    resolution = preview.get_by_role("combobox", name="3D image resolution")
                    expect(resolution).not_to_be_visible()
                    tools.click()
                    expect(resolution).to_be_visible()
                    assert resolution.bounding_box()["width"] <= 80
                    grouped = preview.locator('button[aria-label="Display options"]')
                    expect(grouped).not_to_be_visible()
                elif capability == "boltz.predict":
                    display = preview.get_by_role("button", name="Display options", exact=True)
                    display.click()
                    for label in ("All atoms", "Side chains"):
                        toggle = preview.get_by_role("switch", name=label, exact=True)
                        toggle.click()
                        expect(toggle).to_be_checked()
                        toggle.click()
                        expect(toggle).not_to_be_checked()
                    display.press("Escape")
                    expect(display).to_be_focused()
                else:
                    backbone = preview.get_by_role("button", name="Backbone", exact=True)
                    expect(backbone).to_be_visible(timeout=30000)
                    assert backbone.bounding_box()["height"] >= 44
                    figure = preview.get_by_role("button", name="Export figure ↓", exact=True)
                    expect(figure).to_be_enabled()
                    assert figure.bounding_box()["width"] >= 44
                    backbone.click()
                    expect(backbone).to_have_attribute("aria-pressed", "true")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                page.screenshot(path=evidence / f"consumer-{capability}-320.png")
            assert page.request.get(base + "/api/jobs").json() == jobs
            browser.close()
