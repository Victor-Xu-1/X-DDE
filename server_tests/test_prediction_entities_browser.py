"""Shared entity editing on real compiled forms; no job, draft or asset writes."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

WARHEAD = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_shared_entities_on_prediction_and_feature_forms(language, width):
    zh = language == "zh"
    root = Path("outputs/prediction-entities") / f"{language}-{width}"
    root.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    errors, writes, covered = [], [], []
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        for tool in ("mol1.predict", "predict", "boltz.predict", "features"):
            page.goto(base + "/#view=new&tool=" + tool)
            if tool in {"predict", "features"}:
                page.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
            protein = page.get_by_role(
                "textbox",
                name="序列"
                if zh and tool == "boltz.predict"
                else "Sequence"
                if tool == "boltz.predict"
                else "单字母氨基酸序列"
                if zh
                else "One-letter amino-acid sequence",
                exact=True,
            )
            protein.fill(sequence)
            title = ("蛋白质" if zh else "Protein") + " 1"
            card = page.get_by_role("article", name=title, exact=True)
            expect(card).to_contain_text("847 个残基" if zh else "847 residues")
            toggle = card.get_by_role(
                "button", name=("收起 " if zh else "Collapse ") + title, exact=True
            )
            toggle.click()
            expect(protein).not_to_be_visible()
            closed_height = card.bounding_box()["height"]
            assert closed_height < 160, "Collapsed inputs must remain compact on narrow screens"
            card.get_by_role(
                "button", name=("展开 " if zh else "Expand ") + title, exact=True
            ).click()
            expect(protein).to_have_value(sequence)
            expect(protein).to_be_visible()
            if tool == "boltz.predict":
                chain = card.get_by_role("textbox", name="链编号" if zh else "Chain", exact=True)
                chain.fill("STAT6")
                toggle.click()
                expect(chain).to_be_visible()
                expect(chain).to_have_value("STAT6")
                card.get_by_role(
                    "button", name=("展开 " if zh else "Expand ") + title, exact=True
                ).click()
                expect(protein).to_have_value(sequence)
            if tool in {"mol1.predict", "predict"}:
                ligand = page.get_by_role(
                    "textbox",
                    name="SMILES 或 CCD_ 编号" if zh else "SMILES or CCD_ identifier",
                    exact=True,
                )
                ligand.fill(WARHEAD)
                before = protein.get_attribute("id")
                toggle.click()
                card.get_by_role(
                    "button", name=("展开 " if zh else "Expand ") + title, exact=True
                ).click()
                assert protein.get_attribute("id") == before
                expect(ligand).to_have_value(WARHEAD)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
            page.screenshot(path=root / f"{tool}-entities.png", full_page=True)
            covered.append(tool)
        assert page.request.get(base + "/api/jobs").json() == []
        assert not errors and not writes, (errors, writes)
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "covered_forms": covered,
                    "input": "Public STAT6 P42226 canonical sequence; owner-defined warhead",
                    "retained_inputs": True,
                    "collapsed_inputs_still_mounted": True,
                    "scientific_submissions": 0,
                    "writes": writes,
                    "scientific_acceptance": False,
                },
                indent=2,
            )
        )
        browser.close()
