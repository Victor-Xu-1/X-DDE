"""Real file resolution must precede a scientific coordinate confirmation; no jobs run."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_coordinate_confirmation_waits_for_resolved_material(tmp_path, language, width):
    evidence = Path("outputs/coordinate-confirmation") / language
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    scientific = ScientificStore(store, assets)
    versions = {}
    for key, name, kind, source in (
        ("receptor", "STAT6-9BIG.pdb", "structure", "stat6_receptor"),
        ("molecule", "STAT6-study-molecule.sdf", "molecule", "study_ligand"),
        ("reference", "9BIG-experimental-reference.sdf", "molecule", "bound_reference"),
    ):
        asset = assets.save(
            name, "structure" if kind == "structure" else "ligand", verified_input(source)
        )
        versions[key] = scientific.create(
            VersionInput(asset_id=asset.id, kind=kind, label=name), uuid4()
        )
    zh = language == "zh"
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions, held = [], [], []
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
        open_navigation(page, language).get_by_role(
            "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("gnina.dock")
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        for key, label in (
            ("receptor", "受体结构" if zh else "Receptor structure"),
            ("molecule", "选择分子或已有姿势" if zh else "Choose a molecule or existing pose"),
        ):
            page.get_by_role("radiogroup", name=label, exact=True).get_by_role(
                "radio", name="历史文件" if zh else "Historical files", exact=True
            ).check()
            picker = page.get_by_role(
                "combobox",
                name=label + (" · 历史文件" if zh else " · Historical files"),
                exact=True,
            )
            expect(picker).to_be_enabled()
            picker.select_option("version:" + str(versions[key].id))
        expect(next_button).to_be_enabled()
        next_button.click()
        confirmation = page.get_by_role(
            "checkbox",
            name="我确认参考配体/已有姿势位于所选受体的坐标系中"
            if zh
            else (
                "I confirm the reference/existing pose is in the selected receptor coordinate frame"
            ),
            exact=True,
        )
        expect(confirmation).to_be_disabled()
        expect(next_button).to_be_disabled()
        page.get_by_role("radio", name="历史文件" if zh else "Historical files", exact=True).check()
        picker = page.get_by_role(
            "combobox",
            name="参考口袋配体 · 历史文件" if zh else "Reference pocket ligand · Historical files",
            exact=True,
        )
        expect(picker).to_be_enabled()
        reference = versions["reference"].reference
        target = base + "/api/assets/" + str(reference.asset_id) + "/metadata"
        page.route(target, lambda route: held.append(route))
        picker.select_option("version:" + str(versions["reference"].id))
        expect(
            page.get_by_role("status").filter(
                has_text="正在核对所选文件" if zh else "Checking the selected file"
            )
        ).to_be_visible()
        expect(confirmation).to_be_disabled()
        expect(confirmation).not_to_be_checked()
        expect(next_button).to_be_disabled()
        page.screenshot(path=evidence / "pending-identity.png", full_page=True)
        assert len(held) == 1
        held[0].fulfill(response=held[0].fetch())
        expect(picker).to_be_enabled()
        expect(confirmation).to_be_enabled()
        expect(confirmation).not_to_be_checked()
        confirmation.check()
        expect(next_button).to_be_enabled()
        page.screenshot(path=evidence / "resolved-and-confirmed.png", full_page=True)
        assert not store.list_jobs() and not submissions and not errors
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "resolved_reference": reference.model_dump(mode="json"),
                    "confirmation_blocked_while_identity_pending": True,
                    "confirmation_accepted_after_resolution": True,
                    "scientific_jobs_dispatched": 0,
                },
                indent=2,
            )
        )
        browser.close()
