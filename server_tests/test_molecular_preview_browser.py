"""Actual Ketcher source fidelity and unsupported-form rejection; no inference."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright
from rdkit import Chem

from opendde_workbench.chemistry.sdf_io import split_records
from server_tests.test_navigation_shell_browser import open_navigation

SCAFFOLD = "*c1ccc2cc(C(=O)N(C)C)[nH]c2c1F"
EVIDENCE = Path("outputs/molecular-preview")
FIXTURE = Path("server_tests/fixtures/stat6-generated-states-v0645.sdf")
FIXTURE_SHA = "19605c96836e74bd9475cf1231830d1ea75a4e53618260c50e8a1d91d6a0eff1"


def open_design(browser, language, width):
    page = browser.new_page(viewport={"width": width, "height": 1000})
    page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
    page.goto(os.environ["WB_BROWSER_URL"])
    open_navigation(page, language).get_by_role(
        "button", name="小分子设计" if language == "zh" else "Small-molecule design", exact=True
    ).click()
    page.get_by_role(
        "combobox", name="研究任务" if language == "zh" else "Research task", exact=True
    ).select_option("reinvent.design")
    return page


def assert_native_drawing(page, drawing, expected, name):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    expect(drawing.get_by_role("img")).to_be_visible()
    frame = page.locator('iframe[title="Local 2D molecule drawing service"]').element_handle()
    native = frame.content_frame().evaluate("""async () => ({
        mol: await window.ketcher.getMolfile(),
        ket: JSON.parse(await window.ketcher.getKet()),
    })""")
    (EVIDENCE / f"native-{name}.mol").write_text(native["mol"])
    (EVIDENCE / f"native-{name}.json").write_text(json.dumps(native))
    page.screenshot(path=EVIDENCE / f"source-{name}.png", full_page=True)
    mol = Chem.MolFromMolBlock(native["mol"], removeHs=False, strictParsing=True)
    # A deliberately supplied attachment '*' is a Molfile AtomNull query;
    # actual elements, including the donor N, must remain molecular.
    assert mol is not None and not any(
        atom.HasQuery() for atom in mol.GetAtoms() if atom.GetAtomicNum() != 0
    )
    assert Chem.MolToSmiles(Chem.RemoveHs(mol)) == Chem.MolToSmiles(Chem.RemoveHs(expected))
    raw = Chem.MolFromMolBlock(native["mol"], sanitize=False, removeHs=False)
    assert not any(bond.GetBondType() == Chem.BondType.AROMATIC for bond in raw.GetBonds())
    assert all(
        atom.GetAtomicNum() != 1
        or all(neighbor.GetAtomicNum() in {7, 8, 16} for neighbor in atom.GetNeighbors())
        for atom in mol.GetAtoms()
    )
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_known_smiles_retains_molecular_nh_and_alternating_bonds(language, width):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = open_design(browser, language, width)
        before = page.request.get(base + "/api/jobs").json()
        page.get_by_role(
            "combobox",
            name="想怎样设计分子？" if zh else "How would you like to design molecules?",
            exact=True,
        ).select_option("r_groups")
        source = page.get_by_role(
            "textbox",
            name="片段结构（每行一个）" if zh else "Fragment structures (one per line)",
            exact=True,
        )
        source.fill(SCAFFOLD)
        page.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
        scope = page.get_by_role(
            "region", name="分子设计范围" if zh else "Molecular design scope", exact=True
        )
        assert_native_drawing(
            page,
            scope.locator(".molecule-image"),
            Chem.MolFromSmiles(SCAFFOLD),
            f"aromatic-{language}-{width}",
        )
        page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(source).to_have_value(SCAFFOLD)
        assert page.request.get(base + "/api/jobs").json() == before
        browser.close()


@pytest.mark.parametrize(
    "structure",
    [
        "*N1CCN(c2ccc3c(c2F)=N[C@@H](C(=O)N(C)C)C=3)CC1",
        "*N1CCN(c2ccc3c(c2F)=N/C(=C(/O)N(C)C)C=3)CC1",
    ],
)
def test_unlocalized_smiles_never_export_an_invented_kekule_picture(structure):
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = open_design(browser, "en", 1440)
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        page.get_by_role(
            "combobox", name="How would you like to design molecules?", exact=True
        ).select_option("r_groups")
        source = page.get_by_role("textbox", name="Fragment structures (one per line)", exact=True)
        source.fill(structure)
        page.get_by_role("button", name="Next", exact=True).click()
        drawing = page.get_by_role("region", name="Molecular design scope").locator(
            ".molecule-image"
        )
        expect(drawing).to_have_attribute("data-drawing-state", "unavailable", timeout=60000)
        expect(drawing.get_by_role("img")).to_have_count(0)
        expect(drawing).to_contain_text("2D unavailable")
        page.get_by_role("button", name="Back", exact=True).click()
        expect(source).to_have_value(structure)
        assert page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json() == before
        browser.close()


@pytest.mark.parametrize("record", [1, 4])
def test_real_native_state_records_retain_stereo_and_enol_geometry(record, tmp_path):
    original = FIXTURE.read_bytes()
    assert hashlib.sha256(original).hexdigest() == FIXTURE_SHA
    block = split_records(original)[record]
    source = tmp_path / f"native-state-{record + 1}.sdf"
    source.write_bytes(block + b"$$$$\n")
    expected = Chem.MolFromMolBlock(block.decode(), removeHs=False)
    assert expected is not None
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = open_design(browser, "en", 1440)
        before = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json()
        page.get_by_role(
            "combobox", name="How would you like to design molecules?", exact=True
        ).select_option("analogues")
        page.get_by_label("Upload Choose starting molecule", exact=True).set_input_files(source)
        next_button = page.get_by_role("button", name="Next", exact=True)
        expect(next_button).to_be_enabled(timeout=30000)
        next_button.click()
        drawing = page.get_by_role("region", name="Molecular design scope").locator(
            ".molecule-image"
        )
        assert_native_drawing(page, drawing, expected, f"native-state-{record + 1}")
        assert source.read_bytes() == block + b"$$$$\n"
        assert hashlib.sha256(FIXTURE.read_bytes()).hexdigest() == FIXTURE_SHA
        assert page.request.get(os.environ["WB_BROWSER_URL"] + "/api/jobs").json() == before
        browser.close()
