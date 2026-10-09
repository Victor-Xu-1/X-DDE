"""Actual explicit-H source depiction and editing; no scientific calculation."""

import base64
import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.examples.stat6 import catalogue
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("server_tests/evidence/hydrogen-policy")


def test_real_sdf_preview_and_editor_follow_the_shared_hydrogen_rule():
    base = os.environ["WB_BROWSER_URL"]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, "en").get_by_role(
            "button", name="All capabilities", exact=True
        ).click()
        for summary in page.locator(".capability-additional > summary").all():
            summary.click()
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["boltz.predict"].label[1], exact=True
        ).locator("..").click()
        page.get_by_role("button", name="Use this template", exact=True).click()
        expect(page.get_by_role("button", name="New blank task", exact=True)).to_be_visible()
        picture = page.locator(".molecule-image").first
        picture.scroll_into_view_if_needed()
        expect(picture).to_have_attribute("data-drawing-state", "ready", timeout=45000)
        drawing = page.evaluate("""async () => {
          const editor = document.querySelector('.drawing-service-frame').contentWindow.ketcher;
          return {mol:await editor.getMolfile(),
            ket:JSON.parse(await editor.getKet()),smiles:await editor.getSmiles()};
        }""")
        assert not non_donor_hydrogens(drawing["ket"])
        (EVIDENCE / "native-folded-preview.mol").write_text(drawing["mol"])
        image = picture.locator("img").get_attribute("src")
        assert image.startswith("data:image/svg+xml;base64,")
        (EVIDENCE / "native-folded-preview.svg").write_bytes(
            base64.b64decode(image.split(",", 1)[1])
        )
        page.screenshot(path=EVIDENCE / "explicit-hydrogen-sdf-preview.png", full_page=True)
        page.get_by_role("button", name="Preview study inputs", exact=True).click()
        preview = page.locator(".study-input-preview")
        expect(preview.locator(".viewer-message")).to_have_count(0, timeout=45000)
        page.screenshot(path=EVIDENCE / "stat6-warhead-donor-hydrogens-3d.png")
        preview.get_by_role("button", name="Study PROTAC", exact=True).click()
        expect(preview.locator(".viewer-message")).to_have_count(0, timeout=45000)
        page.screenshot(path=EVIDENCE / "stat6-protac-donor-hydrogens-3d.png")
        open_navigation(page, "en").get_by_role(
            "button", name="Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="Structure editor", exact=True).click()
        page.get_by_role("button", name="Molecule sketch · Ketcher", exact=True).click()
        page.wait_for_function(
            """() => {
              const frame=document.querySelector('.editor-workspace iframe');
              const editor=frame?.contentWindow?.ketcher;
              return editor?.editor?.options().showHydrogenLabels === 'Hetero';
            }""",
            timeout=45000,
        )
        file = catalogue.ROOT / "inputs/STAT6-user-warhead.sdf"
        original = hashlib.sha256(file.read_bytes()).hexdigest()
        upload = page.locator('.editor-workspace input[type="file"]')
        expect(upload).to_be_enabled()
        upload.set_input_files(str(file))
        frame = page.locator(".editor-workspace iframe").first
        expect(frame).to_be_visible()
        # Follow the actual import lifecycle, rather than treating an async
        # molecular getter as a synchronous polling predicate.
        expect(upload).to_be_enabled(timeout=45000)
        edited = page.evaluate("""async () => {
          const editor=document.querySelector('.editor-workspace iframe').contentWindow.ketcher;
          return {mol:await editor.getMolfile(),ket:JSON.parse(await editor.getKet()),
            smiles:await editor.getSmiles()};
        }""")
        assert edited["smiles"]
        assert sum(
            len(node.get("atoms", []))
            for node in edited["ket"].values()
            if isinstance(node, dict) and node.get("type") == "molecule"
        ) == 30
        assert not non_donor_hydrogens(edited["ket"])
        (EVIDENCE / "native-folded-editor.mol").write_text(edited["mol"])
        page.screenshot(path=EVIDENCE / "explicit-hydrogen-editor.png")
        identities = page.evaluate("""async () => {
          const editor=document.querySelector('.editor-workspace iframe').contentWindow.ketcher;
          const cases=['[13CH3][C@@H]([NH3+])c1ccccc1.[Cl-]',
            '[13CH3][C@H]([NH3+])c1ccccc1.[Cl-]', 'c1ccc2[nH]ccc2c1'];
          const rows=[];
          for (const source of cases) {
            await editor.setMolecule(source);
            const before=await editor.getInChIKey();
            const layout=await editor.structService.layout({
              struct:source,output_format:'chemical/x-indigo-ket'});
            const copy=await editor.structService.toggleExplicitHydrogens({
              struct:layout.struct,mode:'fold',output_format:'chemical/x-indigo-ket'});
            await editor.setMolecule(copy.struct);
            await editor.layout(); await editor.dearomatize();
            rows.push({source,before,after:await editor.getInChIKey(),
              ket:JSON.parse(await editor.getKet())});
          }
          return rows;
        }""")
        (EVIDENCE / "native-stereo-charge-isotope-identity.json").write_text(
            json.dumps(identities, indent=2)
        )
        for row in identities:
            assert row["before"] and row["before"] == row["after"]
            assert not non_donor_hydrogens(row["ket"])
        assert identities[0]["after"] != identities[1]["after"]
        assert hashlib.sha256(file.read_bytes()).hexdigest() == original
        assert not errors and not submissions, (errors, submissions)
        assert page.request.get(base + "/api/jobs").json() == []
        (EVIDENCE / "browser-acceptance.json").write_text(
            json.dumps(
                {
                    "source_sha256": original,
                    "preview_non_donor_hydrogens": 0,
                    "editor_non_donor_hydrogens": 0,
                    "scientific_jobs_added": 0,
                }
            )
        )
        browser.close()


def non_donor_hydrogens(value):
    found = []
    for node in value.values():
        if not isinstance(node, dict) or node.get("type") != "molecule":
            continue
        atoms = node["atoms"]
        for index, atom in enumerate(atoms):
            if atom["label"] not in {"H", "D", "T"}:
                continue
            neighbors = [
                i
                for bond in node.get("bonds", [])
                if index in bond["atoms"]
                for i in bond["atoms"]
                if i != index
            ]
            if not any(atoms[i]["label"] in {"N", "O", "S"} for i in neighbors):
                found.append(index)
    return found
