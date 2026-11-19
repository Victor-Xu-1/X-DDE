"""Archived contact figures keep real text off the rendered molecular silhouette."""

import json
from base64 import b64encode
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.native_annotation_views import source_bytes
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.publication_raster_metrics import (
    inspect_native_label_pixels,
    observe_native_label_pixels,
)


def covered_geometry(page, geometry, rows, width, height):
    return page.evaluate(
        """async ({base64, rows, width, height}) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + base64;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', {willReadFrequently: true});
          context.drawImage(image, 0, 0, width, height);
          const rgba = context.getImageData(0, 0, width, height).data;
          let structurePixels = 0;
          for (let x = 3; x < rgba.length; x += 4) structurePixels += Number(rgba[x] >= 24);
          const coverage = rows.map(({text, box}) => {
            const left = Math.max(0, Math.ceil(box.x));
            const right = Math.min(width, Math.floor(box.x + box.width));
            const top = Math.max(0, Math.ceil(box.y));
            const bottom = Math.min(height, Math.floor(box.y + box.height));
            let ink = 0;
            for (let y = top; y < bottom; y++)
              for (let x = left; x < right; x++)
                ink += Number(rgba[(y * width + x) * 4 + 3] >= 24);
            return {text, pixels: ink, fraction: ink / ((right - left) * (bottom - top))};
          });
          return {structurePixels, coverage};
        }""",
        {"base64": b64encode(geometry.read_bytes()).decode(), "rows": rows,
         "width": width, "height": height},
    )

def original_structure(page, base, panel, capability):
    if capability == "discovery.import":
        return source_bytes(page, base, panel)
    link = page.get_by_role("link", name="Download selected pose SDF", exact=True)
    url = link.get_attribute("href")
    assert url
    response = page.request.get(base + url if url.startswith("/") else url)
    assert response.ok
    data = response.body()
    assert b"$$$$" in data
    return {url: data}


@pytest.mark.parametrize(("capability", "selector"), [
    ("discovery.import", ".reference-import-results .viewer-panel"),
    ("workflows", ".module-example-result .viewer-panel"),
])
def test_print_labels_use_clear_space_at_both_resolutions(
    interaction_workspace, capability, selector
):
    evidence = Path("outputs/contact-print-layout") / capability
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, evidence / "server.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1440, "height": 950})
            page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
            observe_native_label_pixels(page)
            jobs = page.request.get(base + "/api/jobs").json()
            writes = []
            page.on(
                "request", lambda req: writes.append(req.url)
                if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None,
            )
            page.goto(base + "/#view=new&tool=" + capability)
            page.get_by_role("button", name="Example results", exact=True).click()
            panel = page.locator(selector)
            figure = panel.get_by_role("button", name="Export figure ↓", exact=True)
            expect(figure).to_be_enabled(timeout=30000)
            panel.get_by_role("button", name="Ligand and pocket", exact=True).click()
            expect(figure).to_be_enabled(timeout=30000)
            original = original_structure(page, base, panel, capability)
            assert all(original.values())
            labels = panel.get_by_role("checkbox", name="Residues and distances", exact=True)
            panel.get_by_text("Contact details", exact=True).click()
            contacts = panel.locator(".contact-details tbody tr").evaluate_all(
                "(rows) => rows.slice(0, 5).map(row => "
                "Array.from(row.cells, cell => cell.textContent.trim()))"
            )
            assert len(contacts) == 5
            expected = {label + " · " + distance.split(" · ")[0] for label, distance in contacts}
            frame = panel.locator(".molecular-stage iframe")
            camera = "f => f.contentDocument.querySelector('canvas')._3dmol_viewer.getView()"
            before = frame.evaluate(camera)
            coordinates = """f => f.contentDocument.querySelector('canvas')._3dmol_viewer
                .selectedAtoms({}).map(atom => [atom.model, atom.index, atom.x, atom.y, atom.z])"""
            atoms = frame.evaluate(coordinates)
            assert len(atoms) > 100
            if capability == "workflows":
                assert len({atom[0] for atom in atoms}) >= 2

            def save(name, dpi, transparent=False):
                def configure(dialog):
                    dialog.get_by_role("combobox", name="Panel layout").select_option("landscape")
                    dialog.get_by_role("combobox", name="Resolution", exact=True).select_option(
                        str(dpi)
                    )
                    if transparent:
                        dialog.get_by_role("checkbox", name="Transparent background").check()
                path = export_figure(page, figure, evidence, name, "en", configure=configure)
                inspect_png(path, dpi=dpi, width=1051 if dpi == 300 else 2102)
                return path

            labels.uncheck()
            geometry = save("geometry-600", 600, transparent=True)
            labels.check()
            for dpi, width, height in ((300, 1051, 701), (600, 2102, 1401)):
                name = "contacts-" + str(dpi)
                save(name, dpi)
                rendered = inspect_native_label_pixels(
                    panel, evidence, name, dpi, width, pt=7, leaders=len(expected)
                )
                assert {row["text"] for row in rendered} == expected
                overlap = covered_geometry(page, geometry, rendered, width, height)
                (evidence / (name + "-silhouette.json")).write_text(json.dumps(overlap, indent=2))
                assert overlap["structurePixels"] > (width * height) * 0.03
                assert all(row["fraction"] < 0.01 for row in overlap["coverage"]), overlap
                assert frame.evaluate(camera) == before
                assert frame.evaluate(coordinates) == atoms
            assert page.request.get(base + "/api/jobs").json() == jobs
            assert original_structure(page, base, panel, capability) == original
            assert not writes
            browser.close()
