"""Retained-source integrity and timeout recovery in native Ketcher; no calculations."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.test_stat6_templates_browser import catalog


@pytest.mark.parametrize(
    "failure,language,width", [("identity", "en", 1440), ("timeout", "zh", 390)]
)
def test_retained_source_failure_can_be_reopened_without_new_versions(failure, language, width):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    root = Path("server_tests/evidence/hydrogen-policy/retained-open") / failure
    root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        context = browser.new_context(viewport={"width": width, "height": 1000})
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = context.new_page()
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, mutations = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        catalog(page, language)
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["properties"].label[not zh], exact=True
        ).locator("..").click()
        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.endswith("/api/examples/properties/prepare")
            )
        ) as prepared:
            page.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        assert prepared.value.ok
        original = prepared.value.json()["objects"]["study_ligand"]
        source_url = base + "/api/assets/" + original["reference"]["asset_id"]
        source = page.request.get(source_url).body()
        assert hashlib.sha256(source).hexdigest() == original["reference"]["sha256"]
        objects_url = base + "/api/research/objects?limit=200"
        before = page.request.get(objects_url).json()
        jobs = page.request.get(base + "/api/jobs").json()
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/assets", "/api/research/objects")
                )
                else None
            ),
        )

        def choose_source():
            open_navigation(page, language).get_by_role(
                "button", name="研究空间" if zh else "Research workspace", exact=True
            ).click()
            page.get_by_role(
                "button", name="研究文件" if zh else "Research files", exact=True
            ).click()
            page.get_by_role(
                "button", name=("分子: " if zh else "Molecule: ") + original["label"], exact=True
            ).click()

        def open_editor():
            page.get_by_role(
                "button", name="编辑分子" if zh else "Edit molecule", exact=True
            ).click()
            return page.locator(".editor-workspace")

        choose_source()
        held = []
        if failure == "identity":
            altered = source.replace(b" C ", b" N ", 1)
            assert altered != source and len(altered) == len(source)
            intercepted_url = source_url
            page.route(intercepted_url, lambda route: route.fulfill(body=altered))
        else:
            intercepted_url = source_url + "/metadata"
            page.route(intercepted_url, lambda route: held.append(route))
        editor = open_editor()
        save = editor.get_by_role(
            "button", name="保存到工作台" if zh else "Save to Workbench", exact=True
        )
        expect(editor.get_by_role("alert")).to_contain_text(
            "does not match" if failure == "identity" else "timed out", timeout=45000
        )
        expect(
            editor.get_by_text("已打开所选版本" if zh else "Selected version opened", exact=False)
        ).to_have_count(0)
        expect(save).to_be_enabled(timeout=45000)
        expect(
            editor.get_by_role(
                "button", name="用这个分子计算性质" if zh else "Calculate properties", exact=True
            )
        ).to_be_enabled()
        assert (
            page.evaluate("""async () => {
            const editor = document.querySelector('.editor-workspace iframe').contentWindow.ketcher;
            return await editor.getSmiles();
        }""")
            == ""
        )
        page.screenshot(path=root / "rejected-source.png", full_page=True)
        if failure == "timeout":
            assert len(held) == 1
            held[0].abort("failed")
        page.unroute(intercepted_url)
        editor.get_by_role("button", name="重试打开" if zh else "Retry opening", exact=True).click()
        expect(editor.get_by_role("status")).to_contain_text(
            "已打开所选版本" if zh else "Selected version opened", timeout=45000
        )
        expect(editor.get_by_role("alert")).to_have_count(0)
        native_smiles = page.evaluate("""async () => {
            const editor = document.querySelector('.editor-workspace iframe').contentWindow.ketcher;
            return await editor.getSmiles();
        }""")
        assert native_smiles
        assert page.request.get(source_url).body() == source
        assert page.request.get(objects_url).json() == before
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not errors and not mutations, (errors, mutations)
        page.screenshot(path=root / "verified-source-reopened.png", full_page=True)
        (root / "acceptance.json").write_text(
            json.dumps(
                {
                    "failure": failure,
                    "language": language,
                    "width": width,
                    "source_sha256": hashlib.sha256(source).hexdigest(),
                    "record": original["reference"]["record"],
                    "version": original["id"],
                    "native_source_reopened": bool(native_smiles),
                    "new_versions": 0,
                    "new_scientific_jobs": 0,
                },
                indent=2,
            )
        )
        context.tracing.stop(path=root / "trace.zip")
        browser.close()
