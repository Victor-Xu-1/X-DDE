"""Native SMILES depiction acceptance through the real questionnaire; no jobs."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright
from rdkit import Chem

from server_tests.test_navigation_shell_browser import open_navigation

SCAFFOLD = "*c1ccc2cc(C(=O)N(C)C)[nH]c2c1F"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_known_smiles_is_a_molecule_not_a_query(language, width):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/molecular-preview")
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language','{language}')"
        )
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: submissions.append(request.url)
                if request.method == "POST" and "/api/jobs" in request.url else None)
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="小分子设计" if zh else "Small-molecule design", exact=True
        ).click()
        page.get_by_role("combobox", name="研究任务" if zh else "Research task",
                         exact=True).select_option("reinvent.design")
        page.get_by_role(
            "combobox",
            name="想怎样设计分子？" if zh else "How would you like to design molecules?",
            exact=True,
        ).select_option("r_groups")
        source = page.get_by_role(
            "textbox", name="片段结构（每行一个）" if zh else "Fragment structures (one per line)",
            exact=True,
        )
        source.fill(SCAFFOLD)
        page.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        scope = page.get_by_role("region", name="分子设计范围" if zh else "Molecular design scope",
                                 exact=True)
        drawing = scope.locator(".molecule-image")
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        expect(drawing.get_by_role("img")).to_be_visible()
        handle = page.locator('iframe[title="Local 2D molecule drawing service"]').element_handle()
        frame = handle.content_frame()
        native = frame.evaluate("""async () => {
            const editor = window.ketcher;
            const mol = await editor.getMolfile();
            const ket = JSON.parse(await editor.getKet());
            return {mol, ket};
        }""")
        (evidence / f"native-{language}-{width}.mol").write_text(native["mol"])
        (evidence / f"native-{language}-{width}.json").write_text(json.dumps(native))
        page.screenshot(path=evidence / f"scaffold-{language}-{width}.png", full_page=True)
        mol = Chem.MolFromMolBlock(native["mol"], removeHs=False, strictParsing=True)
        assert mol is not None and not any(atom.HasQuery() for atom in mol.GetAtoms())
        expected = Chem.MolFromSmiles(SCAFFOLD)
        assert Chem.MolToSmiles(mol, isomericSmiles=True) == Chem.MolToSmiles(expected)
        assert sum(atom.GetAtomicNum() == 0 for atom in mol.GetAtoms()) == 1
        assert any(atom.GetAtomicNum() == 7 and atom.GetTotalNumHs() == 1
                   for atom in mol.GetAtoms())
        raw = Chem.MolFromMolBlock(native["mol"], sanitize=False, removeHs=False)
        assert not any(bond.GetBondType() == Chem.BondType.AROMATIC for bond in raw.GetBonds())
        assert all(atom.GetAtomicNum() != 1 or all(
            neighbor.GetAtomicNum() in {7, 8, 16} for neighbor in atom.GetNeighbors()
        ) for atom in mol.GetAtoms())
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(source).to_have_value(SCAFFOLD)
        assert not errors and not submissions
        assert page.request.get(base + "/api/jobs").json() == before
        browser.close()
