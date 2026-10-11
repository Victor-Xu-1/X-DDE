"""Real STAT6 input switching and recovery through the existing questionnaire; no simulation."""

import hashlib
import json
from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench import __version__
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_original_material_cannot_be_submitted_while_replacement_is_pending(
    tmp_path, language, width
):
    evidence = Path("outputs/reference-input") / language
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    original = assets.save("STAT6-9BIG-original.pdb", "structure", verified_input("stat6_receptor"))
    # Real API pagination: the original structure must remain selectable beyond page one.
    # Filler config records are solely transport fixtures, not scientific inputs/results.
    for index in range(105):
        assets.save(
            f"paging-{index}.json", "config", json.dumps({"paging_fixture": index}).encode()
        )
    alternate = assets.save(
        "STAT6-4Y5U-alternate.pdb", "structure", verified_input("stat6_alternative_receptor")
    )
    assert original.id not in {asset.id for asset in assets.list(100)}, (
        "The pagination fixture must place the original outside the first asset page."
    )
    saved = ScientificStore(store, assets).create(
        VersionInput(asset_id=alternate.id, kind="structure", label="STAT6 alternative construct"),
        uuid4(),
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
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/research/poses/minimize")
                )
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="动力学与 FEP" if zh else "Dynamics and FEP", exact=True
        ).click()
        module = page.get_by_role(
            "region", name="分子动力学" if zh else "Molecular dynamics", exact=True
        )
        next_button = module.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_disabled()
        module.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        picker = module.get_by_role(
            "combobox",
            name="蛋白结构 · 历史文件" if zh else "Protein structure · Historical files",
            exact=True,
        )
        expect(picker.get_by_role("option", name=original.name, exact=True)).to_have_count(1)
        picker.select_option("file:" + original.id)
        expect(next_button).to_be_enabled()
        target = base + "/api/assets/" + alternate.id + "/metadata"
        page.route(target, lambda route: held.append(route))
        picker.select_option("file:" + alternate.id)
        expect(picker).to_have_value("file:" + alternate.id)
        expect(next_button).to_be_disabled()
        expect(
            module.get_by_role("status").filter(
                has_text="正在核对所选文件" if zh else "Checking the selected file"
            )
        ).to_be_visible()
        expect(
            module.get_by_role("alert").filter(
                has_text="暂时无法读取所选文件" if zh else "selected file could not be read"
            )
        ).to_be_visible(timeout=35000)
        expect(next_button).to_be_disabled()
        assert len(held) == 1
        page.screenshot(path=evidence / "bounded-selection.png", full_page=True)
        page.unroute(target)
        module.get_by_role(
            "button", name="重新读取文件" if zh else "Retry selected file", exact=True
        ).click()
        expect(next_button).to_be_enabled()
        expect(picker).to_have_value("file:" + alternate.id)
        # A saved-version hash must match its immutable file. Tamper transport only;
        # the two real structures and persisted reference remain unchanged.
        metadata = alternate.model_dump(mode="json")
        page.route(target, lambda route: route.fulfill(json={**metadata, "sha256": "0" * 64}))
        picker.select_option("version:" + str(saved.id))
        expect(module.get_by_role("alert")).to_contain_text("不一致" if zh else "do not match")
        expect(next_button).to_be_disabled()
        page.screenshot(path=evidence / "identity-rejected.png", full_page=True)
        page.unroute(target)
        picker.select_option("version:" + str(saved.id))
        expect(next_button).to_be_enabled()
        expect(picker).to_have_value("version:" + str(saved.id))
        next_button.click()
        next_button.click()
        next_button.click()
        inputs = module.get_by_role(
            "region", name="所选研究材料" if zh else "Selected research inputs"
        )
        expect(inputs.get_by_text(alternate.name, exact=True)).to_be_visible()
        expect(inputs.get_by_text(original.name, exact=True)).to_have_count(0)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=evidence / "correct-source-review.png", full_page=True)
        for asset in (original, alternate):
            downloaded = page.request.get(base + "/api/assets/" + asset.id).body()
            assert hashlib.sha256(downloaded).hexdigest() == asset.sha256
        assert not errors and not submissions and not store.list_jobs()
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "version": __version__,
                    "language": language,
                    "width": width,
                    "old_source_cleared_while_pending": True,
                    "deadline_and_retry": True,
                    "older_than_first_asset_page_selectable": True,
                    "mismatched_saved_hash_rejected": True,
                    "review_source": alternate.model_dump(mode="json"),
                    "original_source_hashes_unchanged": True,
                    "scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
