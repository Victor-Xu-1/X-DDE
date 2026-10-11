"""Real STAT6 material search/paging and collection verification; no calculation."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_paged_mol_input_and_verified_whole_library(tmp_path, language, width):
    zh = language == "zh"
    evidence = Path("outputs/reference-input/catalog") / language
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    receptor = assets.save("STAT6-receptor.pdb", "structure", verified_input("stat6_receptor"))
    warhead_key = next(key for key, info in FILES.items() if info.name == "STAT6-user-warhead.sdf")
    sdf = verified_input(warhead_key)
    mol = assets.save("STAT6-original.mol", "ligand", sdf.split(b"$$$$")[0])
    library = assets.save("STAT6-molecular-library.sdf", "ligand", sdf)
    # Real files but metadata-only paging fixtures, never examples or computed outputs.
    for index in range(30):
        assets.save(f"Transport-input-{index:02d}.mol", "ligand", sdf.split(b"$$$$")[0])
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, posts = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                posts.append(request.url)
                if request.method == "POST" and "/api/jobs" in request.url
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
        protein = module.locator(".diff-reference").filter(
            has=page.get_by_role(
                "heading", name="蛋白结构" if zh else "Protein structure", exact=True
            )
        )
        protein.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        protein.get_by_role("combobox").select_option("file:" + receptor.id)
        module.get_by_role(
            "radio", name="蛋白与结合小分子" if zh else "Protein with a bound ligand", exact=True
        ).check()
        ligand = module.locator(".diff-reference").filter(
            has=page.get_by_role("heading", name="结合小分子" if zh else "Bound ligand", exact=True)
        )
        ligand.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        picker = ligand.get_by_role("combobox")
        expect(picker.locator("option[value^='file:']")).to_have_count(25)
        pages = ligand.get_by_role(
            "navigation", name="历史材料分页" if zh else "Historical input pages", exact=True
        )
        pages.get_by_role("button", name="下一页" if zh else "Next", exact=True).click()
        picker.select_option("file:" + mol.id)
        expect(ligand.get_by_role("spinbutton")).to_have_count(0)
        search = ligand.get_by_role(
            "searchbox", name="查找历史材料" if zh else "Find historical inputs", exact=True
        )
        search.fill("no-match")
        expect(ligand.get_by_role("status")).to_contain_text("没有匹配" if zh else "No matching")
        expect(picker).to_have_value("file:" + mol.id)
        expect(
            picker.get_by_role(
                "option",
                name=("当前选择：" if zh else "Current selection: ") + mol.name,
                exact=True,
            )
        ).to_have_count(1)
        expect(
            module.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        ).to_be_enabled()
        page.screenshot(path=evidence / "selected-mol-off-page.png")
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("openfe.rbfe")
        module = page.get_by_role(
            "region", name="FEP 结合自由能" if zh else "FEP binding free energy", exact=True
        )
        protein = module.locator(".diff-reference").filter(
            has=page.get_by_role(
                "heading", name="蛋白结构" if zh else "Protein structure", exact=True
            )
        )
        protein.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        protein.get_by_role("combobox").select_option("file:" + receptor.id)
        whole = module.locator(".diff-reference").filter(
            has=page.get_by_role(
                "heading",
                name="整组 SDF 分子文件" if zh else "Whole SDF molecular library",
                exact=True,
            )
        )
        whole.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        target = base + "/api/assets/" + library.id + "/metadata"
        metadata = library.model_dump(mode="json")
        page.route(target, lambda route: route.fulfill(json={**metadata, "sha256": "0" * 64}))
        whole.get_by_role("combobox").select_option("file:" + library.id)
        next_button = module.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_disabled()
        expect(module.get_by_role("alert")).to_contain_text("不一致" if zh else "do not match")
        page.unroute(target)
        whole.get_by_role("combobox").select_option("file:" + library.id)
        expect(next_button).to_be_enabled()
        expect(whole.get_by_role("spinbutton")).to_have_count(0)
        expect(
            module.get_by_text(
                library.name
                + " · "
                + (
                    "下一步选择用于计算的分子"
                    if zh
                    else "Select molecules for calculation in the next step"
                ),
                exact=True,
            )
        ).to_be_visible()
        page.screenshot(path=evidence / "verified-whole-library.png")
        for asset in (receptor, mol, library):
            assert (
                hashlib.sha256(
                    page.request.get(base + "/api/assets/" + asset.id).body()
                ).hexdigest()
                == asset.sha256
            )
        assert not errors and not posts and not store.list_jobs()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "paged_history": True,
                    "selected_mol_retained_outside_query": True,
                    "mol_has_no_sdf_record_control": True,
                    "whole_library_identity_verified": True,
                    "source_files_unchanged": True,
                    "scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
