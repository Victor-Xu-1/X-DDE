"""Real public STAT6 files and compact material controls; never dispatch science."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.material_capture import capture_material


@pytest.mark.parametrize("language,width,theme", [("en", 1280, "warm"), ("zh", 390, "dark")])
def test_compact_sources_and_abandoned_real_upload(tmp_path, language, width, theme):
    root = Path("outputs/material-input") / language
    root.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    protein_bytes = verified_input("stat6_receptor")
    protein = assets.save("STAT6-receptor.pdb", "structure", protein_bytes)
    key = next(key for key, info in FILES.items() if info.name == "STAT6-user-warhead.sdf")
    sdf = verified_input(key)
    ligand = assets.save("STAT6-two-records.sdf", "ligand", sdf + sdf)
    zh = language == "zh"
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.add_init_script(
            f"if(location.origin === {json.dumps(base)}) {{"
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            f"localStorage.setItem('x-dde-theme','{theme}');}}"
        )
        errors, science, held = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda req: (
                science.append(req.url)
                if req.method == "POST"
                and any(
                    part in req.url for part in ("/api/jobs", "/api/batches", "/poses/minimize")
                )
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=p2rank.detect")
        expect(page.locator("html")).to_have_attribute("data-theme", theme)
        panel = page.get_by_role(
            "region",
            name="发现多个候选口袋" if zh else "Discover candidate protein pockets",
            exact=True,
        )
        # Locate by the source control rather than a second manually maintained form identity.
        material = panel.locator(".reference-material")
        upload = material.get_by_role(
            "radio", name="上传新文件" if zh else "Upload a new file", exact=True
        )
        history = material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        )
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(upload).to_be_checked()
        expect(next_button).to_be_disabled()
        heading = material.locator(".reference-material-heading")
        assert heading.evaluate("e => getComputedStyle(e).borderTopLeftRadius") == "19px"
        if width > 640:
            assert heading.bounding_box()["height"] < 90
            assert material.locator(".file-select").bounding_box()["height"] <= 76
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        capture_material(page, root / "pocket-new.png")

        def hold(route):
            if route.request.method == "POST":
                held.append(route)
            else:
                route.continue_()

        page.route("**/api/assets?*", hold)
        material.locator('input[type="file"]').set_input_files(
            {"name": "STAT6-upload.pdb", "mimeType": "chemical/x-pdb", "buffer": protein_bytes}
        )
        expect(
            material.get_by_role("status").filter(has_text="上传中" if zh else "Uploading")
        ).to_be_visible()
        history.check()
        assert len(held) == 1
        for route in held:
            response = route.fetch()
            with page.expect_response(
                lambda response: (
                    response.request.method == "POST" and "/api/assets?" in response.url
                )
            ):
                route.fulfill(response=response)
        expect(next_button).to_be_disabled()
        picker = material.get_by_role("combobox")
        expect(picker).to_have_value("")
        picker.select_option("file:" + protein.id)
        expect(next_button).to_be_enabled()
        upload.check()
        expect(next_button).to_be_disabled()
        history.check()
        expect(picker).to_have_value("file:" + protein.id)
        expect(next_button).to_be_enabled()
        capture_material(page, root / "pocket-history.png")
        next_button.click()
        panel.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(picker).to_have_value("file:" + protein.id)

        page.goto(base + "/#view=new&tool=gnina.dock")
        expect(page.locator("html")).to_have_attribute("data-theme", theme)
        # The later search-region step retains its own hidden reference picker.
        # Inspect the two material inputs actually displayed in this step.
        input_step = page.locator(".questionnaire > fieldset:not([hidden])")
        panels = input_step.locator(".reference-material")
        expect(panels).to_have_count(2)
        receptor = panels.filter(
            has=page.get_by_role(
                "heading", name="受体结构" if zh else "Receptor structure", exact=True
            )
        )
        molecule = panels.filter(
            has=page.get_by_role(
                "heading",
                name="选择分子或已有姿势" if zh else "Choose a molecule or existing pose",
                exact=True,
            )
        )
        for field, asset in ((receptor, protein), (molecule, ligand)):
            field.get_by_role(
                "radio", name="历史文件" if zh else "Historical files", exact=True
            ).check()
            field.get_by_role("combobox").select_option("file:" + asset.id)
        record = molecule.get_by_role("spinbutton")
        expect(record).to_have_value("1")
        record.fill("2")
        molecule.get_by_role(
            "radio", name="上传新文件" if zh else "Upload a new file", exact=True
        ).check()
        molecule.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        expect(record).to_have_value("2")
        record.scroll_into_view_if_needed()
        actions = page.locator(".questionnaire-actions:visible")
        assert actions.evaluate("e => getComputedStyle(e).position") == "static"
        assert (
            actions.bounding_box()["y"]
            >= record.bounding_box()["y"] + record.bounding_box()["height"] + 8
        )
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        capture_material(page, root / "docking-materials.png")
        for asset in (protein, ligand):
            assert (
                hashlib.sha256(
                    page.request.get(base + "/api/assets/" + asset.id).body()
                ).hexdigest()
                == asset.sha256
            )
        assert not errors and not science and not store.list_jobs(), (errors, science)
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "abandoned_upload_ignored": True,
                    "record_restored": 2,
                    "source_hashes_unchanged": True,
                    "scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
