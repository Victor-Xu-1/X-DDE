"""Source-bound camera and download-menu inspection for the shared review gate."""

import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform


def stable_view(page, frame):
    previous = frame.screenshot()
    for _ in range(12):
        page.wait_for_timeout(100)
        current = frame.screenshot()
        if current == previous:
            return current
        previous = current
    raise AssertionError("The native review scene did not settle")


def inspect_native_review_scene(state, evidence):
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    inputs = Path("src/opendde_workbench/examples/stat6/inputs")
    receptor = assets.save(
        "STAT6-9BIG-observed-receptor.pdb",
        "structure",
        (inputs / "STAT6-9BIG-observed-receptor.pdb").read_bytes(),
    )
    ligand = assets.save(
        "9BIG-AK1690-A701.sdf", "ligand", (inputs / "9BIG-AK1690-A701.sdf").read_bytes()
    )
    errors, viewer_requests, writes = [], [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
        page.on("pageerror", lambda error: errors.append(str(error)))

        def record_request(request):
            if "/viewer.html?" in request.url:
                viewer_requests.append(request.url)
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.on("request", record_request)
        page.goto(base + "/#view=new&tool=gnina.dock")

        def choose(title, file):
            picker = page.locator(".diff-reference").filter(
                has=page.get_by_role("heading", name=title, exact=True)
            )
            picker.get_by_role("radio", name="Historical files", exact=True).check()
            picker.get_by_role("combobox").select_option("file:" + str(file.id))

        choose("Receptor structure", receptor)
        choose("Choose a molecule or existing pose", ligand)
        next_step = page.get_by_role("button", name="Next", exact=True)
        next_step.click()
        choose("Reference pocket ligand", ligand)
        page.get_by_role(
            "checkbox",
            name="I confirm the reference/existing pose is in the "
            "selected receptor coordinate frame",
            exact=True,
        ).check()
        next_step.click()
        next_step.click()
        opener = page.get_by_role("button", name="Preview job", exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name="Preview job", exact=True)
        geometry = dialog.get_by_role("region", name="Receptor coordinate frame", exact=True)
        expect(geometry.get_by_role("button", name="Export figure ↓", exact=True)).to_be_enabled(
            timeout=30000
        )
        frame = geometry.locator("iframe")
        expect(geometry.frame_locator("iframe").locator("canvas").first).to_be_visible()
        initial = stable_view(page, frame)
        geometry.get_by_role("button", name="Zoom in", exact=True).click()
        geometry.get_by_role("combobox", name="Focus residues", exact=True).select_option("3")
        adjusted = stable_view(page, frame)
        assert adjusted != initial
        dialog.get_by_role("button", name="Request JSON", exact=True).click()
        shown = json.loads(dialog.get_by_label("X-DDE submission request").inner_text())
        assert shown["receptor"]["sha256"] == receptor.sha256
        assert shown["search"]["reference"]["sha256"] == ligand.sha256
        expect(frame).not_to_be_visible()
        dialog.get_by_role("button", name="Overview", exact=True).click()
        expect(frame).to_be_visible()
        restored = stable_view(page, frame)
        assert restored == adjusted, "Switching review panels changed the researcher camera"
        expect(geometry.get_by_role("combobox", name="Focus residues")).to_have_value("3")
        assert len(viewer_requests) == 1, "The native viewer was reloaded"
        downloads = geometry.locator(".viewer-original-downloads")
        control = downloads.locator("summary")
        bounds = control.bounding_box()
        assert bounds and bounds["width"] >= 32
        control.click()
        expect(downloads.get_by_role("link")).to_have_count(2)
        expect(downloads.get_by_role("link").first).to_be_visible()
        page.screenshot(path=evidence / "download-menu.png")
        control.click()
        (evidence / "adjusted-camera.png").write_bytes(adjusted)
        (evidence / "restored-camera.png").write_bytes(restored)
        dialog.get_by_role("button", name="Edit setup", exact=True).click()
        expect(opener).to_be_focused()
        assert not errors and not writes and not store.list_jobs()
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "retained_camera_pixels": True,
                    "retained_residue_choice": "3",
                    "viewer_document_requests": len(viewer_requests),
                    "download_width": bounds["width"],
                    "api_writes": writes,
                    "page_errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
