"""Recover an actual persisted editor save after deliberately losing its response."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.test_stat6_templates_browser import catalog

EVIDENCE = Path("server_tests/evidence/hydrogen-policy/save-recovery")


@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_save_recovery_and_property_handoff_do_not_duplicate_versions(language):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    root = EVIDENCE / language
    root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, jobs_submitted = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                jobs_submitted.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["properties"].label[not zh], exact=True
        ).locator("..").click()
        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/examples/properties/prepare")
            )
        ) as response:
            page.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        assert response.value.ok
        original = response.value.json()["objects"]["study_ligand"]
        source_url = base + "/api/assets/" + original["reference"]["asset_id"]
        source = page.request.get(source_url).body()
        before = page.request.get(base + "/api/research/objects?limit=200").json()
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role(
            "button", name=("分子: " if zh else "Molecule: ") + original["label"], exact=True
        ).click()
        page.get_by_role("button", name="编辑分子" if zh else "Edit molecule", exact=True).click()
        editor = page.locator(".editor-workspace")
        expect(editor.get_by_role("status")).to_contain_text(
            "已打开所选版本" if zh else "Selected version opened", timeout=45000
        )
        save = editor.get_by_role(
            "button", name="保存到工作台" if zh else "Save to Workbench", exact=True
        )
        expect(save).to_be_enabled()
        uploads, versions, keys, bodies = [], [], [], []

        def upload(route):
            if route.request.method != "POST":
                route.continue_()
                return
            uploads.append(route.request.url)
            if len(uploads) > 1:
                route.abort("failed")
            else:
                route.continue_()

        def save_version(route):
            if route.request.method != "POST":
                route.continue_()
                return
            keys.append(route.request.headers["idempotency-key"])
            bodies.append(route.request.post_data_json)
            result = route.fetch()
            assert result.ok
            versions.append(result.json())
            if len(versions) == 1:
                # The real server has committed; only its response is lost.
                route.abort("failed")
            else:
                route.fulfill(response=result)

        page.route("**/api/assets?*", upload)
        page.route("**/api/research/objects", save_version)
        save.click()
        expect(editor.get_by_role("alert")).to_contain_text(
            "未能确认保存结果" if zh else "The save result could not be confirmed"
        )
        assert len(versions) == 1
        save.click()
        expect(editor.get_by_role("status")).to_contain_text(
            "已保存" if zh else "Saved.", timeout=15000
        )
        assert len(uploads) == 1 and len(versions) == 2
        assert keys[0] == keys[1] and bodies[0] == bodies[1]
        assert versions[0] == versions[1]
        assert versions[0]["parent_id"] == original["id"]
        assert versions[0]["family_id"] == original["family_id"]
        save.click()
        editor.get_by_role(
            "button", name="用这个分子计算性质" if zh else "Calculate properties", exact=True
        ).click()
        expect(
            editor.get_by_role(
                "heading",
                name="检查分子并计算性质" if zh else "Review molecule and calculate properties",
                exact=True,
            )
        ).to_be_visible()
        assert len(uploads) == 1 and len(versions) == 2
        after = page.request.get(base + "/api/research/objects?limit=200").json()
        assert len(after) == len(before) + 1
        assert page.request.get(source_url).body() == source
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not errors and not jobs_submitted, (errors, jobs_submitted)
        page.screenshot(path=root / "recovered-editor-save.png", full_page=True)
        (root / "acceptance.json").write_text(
            json.dumps(
                {
                    "source_sha256": hashlib.sha256(source).hexdigest(),
                    "new_versions": 1,
                    "uploads": len(uploads),
                    "version_requests": len(versions),
                    "saved_version": versions[0]["id"],
                    "preserved_parent": original["id"],
                    "new_scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
