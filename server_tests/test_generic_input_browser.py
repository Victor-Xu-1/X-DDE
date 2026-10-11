"""Shared file/sequence transports over real STAT6 inputs; no antibody or property computation."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_shared_history_sequence_retry_and_preserved_originals(tmp_path, language, width):
    zh = language == "zh"
    evidence = Path("outputs/reference-input/generic") / language
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    scientific = ScientificStore(store, assets)
    fasta = verified_input("stat6_sequence")
    sequence = assets.save("Original-STAT6.fasta", "sequences", fasta)
    sdf_key = next(key for key, info in FILES.items() if info.name == "STAT6-user-warhead.sdf")
    molecule = assets.save("Original-STAT6-warhead.sdf", "ligand", verified_input(sdf_key))
    for index in range(30):
        assets.save(f"Transport-sequence-{index:02d}.fasta", "sequences", fasta)
        assets.save(f"Transport-molecule-{index:02d}.sdf", "ligand", verified_input(sdf_key))
    with scientific.store.connect() as db:
        before = db.execute("SELECT COUNT(*) FROM scientific_objects").fetchone()[0]
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
            "button", name="性质与安全性" if zh else "Properties and safety", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("properties")
        page.locator(".questionnaire:visible").get_by_role(
            "button", name="下一步" if zh else "Next", exact=True
        ).click()
        picker = page.locator(".questionnaire:visible .asset-picker")
        picker.locator("summary").click()
        expect(
            picker.get_by_role("combobox").locator("option[value]:not([value=''])")
        ).to_have_count(25)
        picker.get_by_role("button", name="下一页" if zh else "Next page", exact=True).click()
        picker.get_by_role("combobox").select_option(molecule.id)
        picker.get_by_role("searchbox").fill("no-match")
        expect(picker.get_by_role("status")).to_contain_text("没有匹配" if zh else "No matching")
        expect(picker.get_by_role("combobox")).to_have_value(molecule.id)
        page.screenshot(path=evidence / "generic-selected-off-page.png")
        open_navigation(page, language).get_by_role(
            "button", name="生物药研究" if zh else "Biologics research", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("antibody.number")
        # These are shared input controls, not a claim that STAT6 is an antibody variable domain.
        picker = page.locator(".questionnaire:visible .diff-reference")
        picker.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        picker.get_by_role("searchbox").fill("Original-STAT6")
        selector = picker.get_by_role("combobox")
        expect(selector.locator("option[value^='file:']")).to_have_count(1)
        selector.select_option("file:" + sequence.id)
        next_button = page.locator(".questionnaire:visible").get_by_role(
            "button", name="下一步" if zh else "Next", exact=True
        )
        expect(next_button).to_be_enabled()
        picker.get_by_role("searchbox").fill("no-match")
        expect(picker.get_by_role("status")).to_contain_text("没有匹配" if zh else "No matching")
        expect(selector).to_have_value("file:" + sequence.id)
        picker.get_by_role(
            "radio", name="粘贴序列" if zh else "Paste sequences", exact=True
        ).check()
        expect(next_button).to_be_disabled()
        picker.get_by_role(
            "textbox", name="序列或 FASTA" if zh else "Sequence or FASTA", exact=True
        ).fill(fasta.decode())
        requests = []

        def lost_reply(route):
            requests.append(route.request.headers.get("idempotency-key"))
            response = route.fetch()
            assert response.ok
            route.fulfill(status=503, json={"detail": "Controlled lost save response"})

        page.route("**/api/research/objects", lost_reply)
        confirm = picker.get_by_role(
            "button", name="确认序列" if zh else "Confirm sequences", exact=True
        )
        confirm.click()
        expect(picker.get_by_role("alert")).to_contain_text(
            "同一个保存请求" if zh else "same save request"
        )
        expect(next_button).to_be_disabled()
        page.unroute("**/api/research/objects", lost_reply)
        confirm.click()
        expect(next_button).to_be_enabled()
        page.screenshot(path=evidence / "sequence-explicit-save-recovered.png")
        with scientific.store.connect() as db:
            assert db.execute("SELECT COUNT(*) FROM scientific_objects").fetchone()[0] == before + 1
        for item in (sequence, molecule):
            assert (
                hashlib.sha256(page.request.get(base + "/api/assets/" + item.id).body()).hexdigest()
                == item.sha256
            )
        assert requests and requests[0]
        assert not errors and not posts and not store.list_jobs()
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "paged_generic_and_sequence_history": True,
                    "saved_sequence_versions": 1,
                    "originals_unchanged": True,
                    "submitted_jobs": 0,
                    "scientific_inference": False,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
