"""Actual public STAT6 file-source journeys in three medicinal-chemistry forms."""

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
def test_molecular_sources_do_not_replace_selected_inputs_or_dispatch_science(
    tmp_path, language, width, theme
):
    root = Path("outputs/material-input") / ("molecular-" + language)
    root.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    key = next(key for key, item in FILES.items() if item.name == "STAT6-user-warhead.sdf")
    sdf = verified_input(key)
    original = assets.save("STAT6-calculated-warhead.sdf", "ligand", sdf)
    library = assets.save("STAT6-two-records.sdf", "ligand", sdf + sdf)
    zh = language == "zh"
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.add_init_script(
            f"if(location.origin==={json.dumps(base)}){{localStorage.setItem('opendde-workbench.language','{language}');localStorage.setItem('x-dde-theme','{theme}');}}"
        )
        errors, science, uploads, held = [], [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def observe(request):
            if request.method != "POST":
                return
            if any(
                part in request.url for part in ("/api/jobs", "/api/batches", "/poses/minimize")
            ):
                science.append(request.url)
            if "/api/assets?" in request.url:
                uploads.append(request.url)

        page.on("request", observe)
        page.goto(base + "/#view=new&tool=properties")
        panel = page.get_by_role(
            "region", name="计算小分子性质" if zh else "Calculate molecular properties", exact=True
        )
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        next_button.click()
        material = panel.locator(".asset-picker .reference-material")
        fresh = material.get_by_role(
            "radio", name="上传新文件" if zh else "Upload a new file", exact=True
        )
        history = material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        )
        results = material.get_by_role(
            "radio", name="任务结果文件" if zh else "Task result files", exact=True
        )
        expect(fresh).to_be_checked()
        expect(next_button).to_be_disabled()
        expect(material.locator("details")).to_have_count(0)
        assert (
            material.bounding_box()["width"]
            >= panel.locator(".asset-picker").bounding_box()["width"] - 1
        )
        if width > 640:
            assert material.locator(".file-select").bounding_box()["height"] <= 76
        else:
            boxes = [
                label.bounding_box()
                for label in material.locator(".questionnaire-choices label").all()
            ]
            assert len(boxes) == 3 and all(box["height"] >= 44 for box in boxes)
            assert max(box["y"] for box in boxes) - min(box["y"] for box in boxes) < 1
        capture_material(page, root / "properties-new.png")

        def hold_upload(route):
            # Hold before forwarding. Recording after fetch lets nested browser
            # events race with the response and falsely report no interception.
            held.append(route)

        page.route("**/api/assets?*", hold_upload)
        material.locator('input[type="file"]').set_input_files(
            {"name": "STAT6-abandoned.sdf", "mimeType": "chemical/x-mdl-sdfile", "buffer": sdf}
        )
        expect(
            material.get_by_role("status").filter(has_text="上传中" if zh else "Uploading")
        ).to_be_visible()
        history.check()
        picker = material.get_by_role("combobox")
        expect(picker).to_be_enabled()
        picker.select_option(original.id)
        expect(next_button).to_be_enabled()
        assert len(held) == 1
        for route in held:
            response = route.fetch()
            with page.expect_response(
                lambda reply: reply.request.method == "POST" and "/api/assets?" in reply.url
            ):
                route.fulfill(response=response)
        expect(picker).to_have_value(original.id)
        expect(history).to_be_checked()
        page.unroute("**/api/assets?*", hold_upload)
        fresh.check()
        expect(next_button).to_be_disabled()
        with page.expect_response(
            lambda reply: reply.request.method == "POST" and "/api/assets?" in reply.url
        ) as response:
            material.locator('input[type="file"]').set_input_files(
                {"name": "STAT6-confirmed.sdf", "mimeType": "chemical/x-mdl-sdfile", "buffer": sdf}
            )
        confirmed = response.value.json()
        expect(next_button).to_be_enabled()
        expect(material.locator(".selected-file")).to_have_text("STAT6-confirmed.sdf")
        history.check()
        expect(picker).to_have_value(original.id)
        results.check()
        expect(next_button).to_be_disabled()
        expect(
            material.get_by_role(
                "region", name="选择任务结果" if zh else "Choose a task result", exact=True
            )
        ).to_be_visible()
        fresh.check()
        expect(material.locator(".selected-file")).to_have_text("STAT6-confirmed.sdf")
        expect(next_button).to_be_enabled()
        assert len(uploads) == 2
        next_button.click()
        panel.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(fresh).to_be_checked()
        expect(material.locator(".selected-file")).to_have_text("STAT6-confirmed.sdf")
        capture_material(page, root / "properties-restored.png")

        page.goto(base + "/#view=new&tool=admet.predict")
        panel = page.get_by_role(
            "region",
            name="性质与早期安全性预测" if zh else "ADMET and early safety predictions",
            exact=True,
        )
        panel.get_by_role(
            "radio", name="一组候选分子" if zh else "A candidate set", exact=True
        ).check()
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        next_button.click()
        material = panel.locator(".asset-picker .reference-material")
        expect(
            material.get_by_role(
                "radio", name="上传新文件" if zh else "Upload a new file", exact=True
            )
        ).to_be_checked()
        expect(next_button).to_be_disabled()
        material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        material.get_by_role("combobox").select_option(library.id)
        expect(next_button).to_be_enabled()
        capture_material(page, root / "admet-library.png")

        page.goto(base + "/#view=new&tool=chemistry.screen")
        panel = page.get_by_role(
            "region",
            name="分子库与早期筛选" if zh else "Library and early molecular selection",
            exact=True,
        )
        material = panel.locator(".asset-picker .reference-material")
        material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        material.get_by_role("combobox").select_option(library.id)
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_enabled()
        next_button.click()
        panel.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(material.get_by_role("combobox")).to_have_value(library.id)
        capture_material(page, root / "screening-library.png")
        for asset in (original, library):
            assert (
                hashlib.sha256(
                    page.request.get(base + "/api/assets/" + asset.id).body()
                ).hexdigest()
                == asset.sha256
            )
        assert (
            hashlib.sha256(
                page.request.get(base + "/api/assets/" + confirmed["id"]).body()
            ).hexdigest()
            == confirmed["sha256"]
            == hashlib.sha256(sdf).hexdigest()
        )
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        assert not errors and not science and not store.list_jobs(), (errors, science)
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "original_sha256": original.sha256,
                    "library_sha256": library.sha256,
                    "confirmed_upload": confirmed,
                    "abandoned_upload_ignored": True,
                    "source_selections_restored": True,
                    "three_real_consumers": ["properties", "admet.predict", "chemistry.screen"],
                    "new_scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
