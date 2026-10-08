"""Bilingual real Chromium questionnaire checks, without performing owner calculations."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_simulation_modules_are_compact_new_task_questionnaires(tmp_path, language, width):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.examples.structure_inputs import observed_alt_a_pdb, protein_only_pdb
    from opendde_workbench.store import Store

    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    # Public structure bytes, no invented coordinates and no scientific calculation.
    source = verified_file(tmp_path / "public", FILES["brd4"])
    assets.save("BRD4-protein.pdb", "structure", protein_only_pdb(observed_alt_a_pdb(source)))
    evidence = Path("outputs/simulation-browser")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(state, evidence / f"{language}-{width}.log") as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        # Use the actual app's persisted language key and explicitly enter the capability.
        page.goto(base)
        page.evaluate(
            "language => localStorage.setItem('opendde-workbench.language', language)", language
        )
        page.reload()
        # The sidebar's module selector is available through the mobile drawer too.
        open_navigation(page, language)
        page.get_by_role(
            "button", name="Dynamics and FEP" if language == "en" else "动力学与 FEP", exact=True
        ).click()
        heading = page.get_by_role(
            "heading", name="1. Choose research inputs" if language == "en" else "1. 选择研究材料"
        )
        expect(heading).to_be_visible()
        next_button = page.get_by_role(
            "button", name="Next" if language == "en" else "下一步", exact=True
        )
        expect(next_button).to_be_disabled()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(evidence / f"{language}-{width}-inputs.png"), full_page=True)
        # This gate checks form states. Native trajectory/FEP results use the separate native gate.
        assert not errors
        assert store.list_jobs() == []
        browser.close()
