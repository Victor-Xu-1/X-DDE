"""Reflow a real archived workflow viewer within the same desktop window."""

from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.publication_browser_helpers import export_figure, inspect_png

EVIDENCE = Path("outputs/compact-native-viewer")


def test_archived_workflow_reflows_without_remounting_its_structure(interaction_workspace):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, EVIDENCE / "split-viewer.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1110, "height": 740})
            page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
            writes = []
            page.on(
                "request", lambda req: writes.append(req.url)
                if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None,
            )
            before = page.request.get(base + "/api/jobs").json()
            run = page.request.get(base + "/api/examples/workflows/result").json()["record"]["run"]
            job_id = run["attempts"][0]["job_id"]
            manifest = page.request.get(base + f"/api/jobs/{job_id}/result").json()
            original_url = base + f"/api/jobs/{job_id}/download?" + urlencode({
                "name": manifest["poses"][0]["artifact"],
            })
            source = page.request.get(original_url).body()

            page.goto(base + "/#view=new&tool=workflows")
            page.get_by_role("button", name="Example results", exact=True).click()
            result = page.locator(".module-example-result")
            panel = result.locator(".viewer-panel")
            stage = panel.locator(".molecular-stage")
            frame = stage.locator("iframe")
            figure = panel.get_by_role("button", name="Export figure ↓", exact=True)
            expect(figure).to_be_enabled(timeout=30000)
            original_frame = frame.element_handle()
            assert original_frame
            position = "f => f.contentDocument.querySelector('canvas')._3dmol_viewer.getView()"
            native_atoms = """f => f.contentDocument.querySelector('canvas')
                ._3dmol_viewer.getModel(0).selectedAtoms({})
                .map(atom => [atom.index, atom.x, atom.y, atom.z])"""
            atoms = frame.evaluate(native_atoms)
            assert len(atoms) > 100
            files = panel.get_by_role(
                "button", name="Structure files and resolution", exact=True, include_hidden=True,
            )
            scale = panel.get_by_role("combobox", name="3D image resolution", exact=True)
            expect(files).to_be_visible()
            expect(scale).not_to_be_visible()
            assert stage.bounding_box()["y"] < 550
            page.screenshot(path=EVIDENCE / "split-1110.png")
            for label in ("Backbone", "Ligand and pocket", "Surface", "Backbone"):
                mode = panel.get_by_role("button", name=label, exact=True)
                mode.click()
                expect(mode).to_have_attribute("aria-pressed", "true")
            files.click()
            scale.select_option("3")
            expand = panel.get_by_role("button", name="Expand research workspace", exact=True)
            expand.click()
            close = panel.get_by_role("button", name="Close expanded view", exact=True)
            expect(close).to_be_visible()
            expect(files).not_to_be_visible()
            expect(scale).to_have_value("3")
            expect(scale).to_be_visible()
            assert page.viewport_size["width"] == 1110
            page.screenshot(path=EVIDENCE / "split-expanded-1110.png")
            close.click()
            expect(expand).to_be_focused()
            expect(files).to_be_visible()
            expect(scale).not_to_be_visible()
            files.click()
            scale.focus()
            page.set_viewport_size({"width": 1680, "height": 900})
            expect(files).to_have_attribute("aria-expanded", "false")
            expect(files).not_to_be_visible()
            expect(scale).to_be_focused()
            scale.press("Escape")
            expect(scale).to_be_focused()
            expect(scale).to_have_value("3")
            page.set_viewport_size({"width": 1110, "height": 740})
            expect(files).to_be_visible()
            expect(scale).not_to_be_visible()
            expect(files).to_be_focused()
            page.set_viewport_size({"width": 1680, "height": 900})
            expect(files).not_to_be_visible()
            focused_action = panel.locator(".viewer-tool-group.is-actions .viewer-tool-content")
            expect(focused_action.locator(":focus")).to_be_visible()
            page.set_viewport_size({"width": 1110, "height": 740})
            expect(files).to_be_visible()
            expect(scale).not_to_be_visible()
            assert frame.evaluate("(node, original) => node === original", original_frame)
            assert frame.evaluate(native_atoms) == atoms
            download = result.get_by_role("link", name="Download selected pose SDF", exact=True)
            with page.expect_download() as transfer:
                download.click()
            assert transfer.value.path().read_bytes() == source

            def configure(dialog):
                dialog.get_by_role("combobox", name="Panel layout").select_option("landscape")
                dialog.get_by_role("combobox", name="Resolution", exact=True).select_option("300")

            view = frame.evaluate(position)
            png = export_figure(page, figure, EVIDENCE, "split-archived-pose", "en",
                                configure=configure)
            inspect_png(png, dpi=300, width=1051)
            assert frame.evaluate(position) == view
            page.set_viewport_size({"width": 390, "height": 775})
            expand.click()
            expect(close).to_be_visible()
            files.click()
            scale.focus()
            scale.press("Escape")
            expect(files).to_be_focused()
            expect(scale).not_to_be_visible()
            expect(close).to_be_visible()
            files.press("Escape")
            expect(expand).to_be_focused()
            expect(close).not_to_be_visible()
            assert frame.evaluate("(node, original) => node === original", original_frame)
            assert frame.evaluate(native_atoms) == atoms
            assert page.request.get(base + "/api/jobs").json() == before
            assert writes == []
            browser.close()
