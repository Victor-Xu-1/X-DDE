"""Rendered backend choice and four preparation steps; never submits a scientific task."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_switch_gromacs_keep_questionnaire_and_review_native_engine(tmp_path, language, width):
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.examples.structure_inputs import observed_alt_a_pdb, protein_only_pdb
    from opendde_workbench.store import Store

    evidence = Path("outputs/gromacs-switch")
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    source = verified_file(tmp_path / "public", FILES["brd4"])
    protein = tmp_path / "BRD4-protein.pdb"
    protein.write_bytes(protein_only_pdb(observed_alt_a_pdb(source)))
    with platform(state, evidence / f"{language}-{width}.log") as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base)
        page.evaluate("v => localStorage.setItem('opendde-workbench.language',v)", language)
        page.reload()
        open_navigation(page, language)
        page.get_by_role(
            "button", name="Dynamics and FEP" if language == "en" else "动力学与 FEP", exact=True
        ).click()
        methods = page.get_by_role(
            "group", name="Backend method" if language == "en" else "后端模型"
        )
        expect(methods.get_by_role("button", name="OpenMM", exact=False)).to_have_attribute(
            "aria-pressed", "true"
        )
        methods.get_by_role("button", name="GROMACS", exact=False).click()
        page.screenshot(path=str(evidence / f"{language}-{width}-backend.png"), full_page=True)
        print(
            {
                "language": language,
                "errors": errors,
                "page": page.locator("body").inner_text()[:5000],
            }
        )
        expect(methods.get_by_role("button", name="GROMACS", exact=False)).to_have_attribute(
            "aria-pressed", "true"
        )
        next_button = page.get_by_role(
            "button", name="Next" if language == "en" else "下一步", exact=True
        )
        expect(next_button).to_be_disabled()
        expect(
            page.get_by_role(
                "radio", name="Upload a new file" if language == "en" else "上传新文件", exact=True
            ).first
        ).to_be_checked()
        page.get_by_label(
            "Upload Protein structure" if language == "en" else "上传 蛋白结构", exact=True
        ).set_input_files(protein)
        expect(next_button).to_be_enabled()
        for step in range(1, 5):
            # Entry motion intentionally translates the whole active page. Measure
            # after its actual animation settles; do not disable product motion.
            page.wait_for_function(
                """() => {
                    const panel = document.querySelector('.questionnaire fieldset:not([hidden])');
                    return panel && panel.getAnimations({subtree:true})
                        .every(animation => animation.playState !== 'running');
                }"""
            )
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if step == 3:
                controls = [
                    page.get_by_role("combobox", name=name, exact=True).bounding_box()
                    for name in (
                        ("Temperature", "Independent repeats", "Compute device")
                        if language == "en"
                        else ("温度", "独立重复", "计算设备")
                    )
                ]
                if width >= 768:
                    assert all(box for box in controls)
                    assert (
                        max(box["y"] for box in controls) - min(box["y"] for box in controls) <= 1
                    )
            if step == 4:
                selected_inputs = page.get_by_role(
                    "region",
                    name="Selected research inputs" if language == "en" else "所选研究材料",
                )
                expect(selected_inputs.get_by_text("BRD4-protein.pdb", exact=True)).to_be_visible()
            page.screenshot(
                path=str(evidence / f"{language}-{width}-step-{step}.png"), full_page=True
            )
            if step < 4:
                next_button.click()
        expect(page.get_by_text("GROMACS 2026.3", exact=True)).to_be_visible()
        expect(page.get_by_text("1 files", exact=True)).to_have_count(0)
        expect(page.get_by_text("1 repeats", exact=True)).to_have_count(0)
        expect(
            page.get_by_role(
                "button", name="Submit simulation" if language == "en" else "提交模拟", exact=True
            )
        ).to_be_disabled()
        assert not submissions and not store.list_jobs() and not errors
        (evidence / f"{language}-{width}-scope.json").write_text(
            json.dumps(
                {
                    "scientific_calculations": False,
                    "backend_selected": "gromacs",
                    "native_execution_evidence": False,
                    "steps_reviewed": 4,
                    "source": FILES["brd4"].url,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
