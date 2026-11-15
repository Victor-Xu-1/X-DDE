"""Native display/identity and history; zero scientific inference or jobs."""

import hashlib
import json
import os
from contextlib import suppress
from pathlib import Path

from playwright.sync_api import sync_playwright
from rdkit import Chem

from opendde_workbench.examples.stat6 import catalogue
from server_tests.recognition_editor_fixture import (
    prepare_policy,
    save_snapshot,
    snapshot,
    wait_available,
    wait_view,
)
from server_tests.test_hydrogen_policy_browser import non_donor_hydrogens


def test_native_recognition_display_and_import_preserve_identity(tmp_path):
    assert tmp_path.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("server_tests/evidence/hydrogen-policy/native-recognition")
    evidence.mkdir(parents=True, exist_ok=True)
    source = catalogue.ROOT / "inputs/STAT6-user-warhead.sdf"
    raw = source.read_text()
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    expected = Chem.SDMolSupplier(str(source), removeHs=False)[0]
    assert expected is not None
    identity = Chem.MolToSmiles(Chem.RemoveHs(expected), isomericSmiles=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.new_page()
        errors, jobs = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: jobs.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs") else None)
        policy_asset = prepare_policy(page, base, tmp_path / "compiled")
        try:
            assert load_source(page, raw)
            wait_available(page)
            first = wait_view(page)
            assert not non_donor_hydrogens(first["ket"])
            verify_identity(first, identity)
            assert first["zoom"] > 0.1
            save_snapshot(evidence, "owned-stat6-source", first)
            page.screenshot(path=evidence / "owned-stat6-display.png")
            width = 1440
            while width > 390:
                width = max(390, int(width * 0.95))
                page.set_viewport_size({"width": width, "height": 1000})
                page.wait_for_function(
                    "width => window.nativeResizeWidths.at(-1) === width", arg=width
                )
            wait_available(page)
            narrow = wait_view(page)
            verify_identity(narrow, identity)
            assert narrow["key"] == first["key"]
            assert narrow["ket"] == first["ket"]
            assert narrow["zoom"] < first["zoom"]
            page.screenshot(path=evidence / "owned-stat6-390-display.png")
            page.set_viewport_size({"width": 1440, "height": 1000})
            page.wait_for_function("() => window.nativeResizeWidths.at(-1) === 1440")
            wait_available(page)
            restored = wait_view(page)
            assert abs(restored["zoom"] - first["zoom"]) < 1e-6
            assert restored["key"] == first["key"]
            assert restored["ket"] == first["ket"]
            # Native replacements reach the same public observer as native file
            # tools. Stock UI import is a separate installed-host Chrome gate:
            # the standalone 3.18 shell's New Project action reloads its document.
            no_h = tmp_path / "STAT6-no-H-3D.sdf"
            molecule = Chem.RemoveHs(expected)
            assert molecule.GetConformer().Is3D()
            writer = Chem.SDWriter(str(no_h))
            writer.write(molecule)
            writer.close()
            for label, file in (("explicit-H-native", source), ("no-H-3D-native", no_h)):
                assert load_source(page, "")
                wait_available(page, require_molecule=False)
                assert not snapshot(page)["state"]["available"]
                page.evaluate("source => window.ketcher.setMolecule(source)", file.read_text())
                page.wait_for_function("() => !window.nativePolicyState.available")
                assert page.evaluate("() => window.nativeDisplayPolicy.recheck()")
                page.wait_for_function("""async () => {
                  const ket=JSON.parse(await window.ketcher.getKet());
                  const atoms=Object.values(ket).flatMap(node=>node?.type==='molecule'?node.atoms:[]);
                  return atoms.length===30;
                }""", timeout=45000)
                wait_available(page)
                found = snapshot(page)
                assert not non_donor_hydrogens(found["ket"])
                assert found["zoom"] > 0.1
                verify_identity(found, identity)
                save_snapshot(evidence, label, found)
                if label == "explicit-H-native":
                    # Undo/Redo are the native history API. Validation must not
                    # append another fold and trap Undo or truncate Redo.
                    page.evaluate("() => window.ketcher.editor.undo()")
                    page.wait_for_function("() => !window.nativePolicyState.available")
                    replay = snapshot(page)
                    assert non_donor_hydrogens(replay["ket"])
                    page.evaluate("() => window.ketcher.editor.redo()")
                    wait_available(page)
                    verify_identity(snapshot(page), identity)
            # Native absolute stereo, isotope and charge are checked independently
            # of the view's H-connectivity predicate.
            cases = ["[13CH3:7][C@@H]([NH3+])c1ccccc1.[Cl-]",
                     "[13CH3:7][C@H]([NH3+])c1ccccc1.[Cl-]",
                     "C/C=C/C", "C/C=C\\C", "c1ccc2[nH]ccc2c1"]
            rows = []
            for chemical in cases:
                assert load_source(page, chemical)
                wait_available(page)
                found = snapshot(page)
                verify_identity(found, Chem.MolToSmiles(Chem.MolFromSmiles(chemical)))
                assert not non_donor_hydrogens(found["ket"])
                rows.append({"source": chemical, **found})
            assert rows[0]["key"] != rows[1]["key"]
            assert rows[2]["key"] != rows[3]["key"]
            # Protected non-donor isotope H must never silently become an
            # ordinary C-H. Unsupported display conversion is a safe failure.
            previous = snapshot(page)
            rejection = page.evaluate("""async () => {
              try { await window.nativeDisplayPolicy.load('C[2H]'); return false; }
              catch { return true; }
            }""")
            assert rejection
            assert snapshot(page)["key"] == previous["key"]
            assert page.evaluate("() => window.nativeDisplayPolicy.recheck()")
            wait_available(page)
            (evidence / "native-identity.json").write_text(json.dumps(rows, indent=2))
            assert not errors and not jobs, (errors, jobs)
            assert page.request.get(base + "/api/jobs").json() == []
            assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
            (evidence / "acceptance.json").write_text(json.dumps({
                "source_sha256": source_hash, "model_execution": False, "new_jobs": 0,
                "owned_import": True, "native_replacements": 2,
                "stock_ui_import": "requires installed-host Chrome acceptance",
                "native_identity_cases": len(cases),
                "owner_original_files_changed": False,
            }, indent=2))
        finally:
            with suppress(Exception):
                page.screenshot(path=evidence / "last-native-state.png")
                (evidence / "last-native-state.html").write_text(page.content())
            with suppress(Exception):
                page.evaluate("() => window.nativePolicyAbort?.abort()")
            context.tracing.stop(path=evidence / "trace.zip")
            browser.close()
            policy_asset.unlink()


def load_source(page, source):
    return page.evaluate("source => window.nativeDisplayPolicy.load(source)", source)


def verify_identity(value, identity):
    molecule = Chem.MolFromMolBlock(value["mol"], removeHs=False)
    assert molecule is not None
    assert not molecule.GetConformer().Is3D()
    assert all(abs(point[2]) < 1e-6 for point in molecule.GetConformer().GetPositions())
    assert Chem.MolToSmiles(Chem.RemoveHs(molecule), isomericSmiles=True) == identity
