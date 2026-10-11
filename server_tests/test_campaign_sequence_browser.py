"""Inspect the current STAT6 design input, without inventing a binder or result."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.capabilities.definitions import CAPABILITIES
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("server_tests/evidence/sequence-results")


@pytest.mark.parametrize("language", ["en", "zh"])
def test_stat6_campaign_input_has_exact_sequence_and_no_generated_design(language):
    base = os.environ["WB_BROWSER_URL"]
    zh = language == "zh"
    root = EVIDENCE / ("campaign-" + language)
    root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="全部能力" if zh else "All capabilities", exact=True
        ).click()
        for summary in page.locator(".capability-additional > summary").all():
            summary.click()
        page.locator(".tool-card").get_by_role(
            "heading", name=CAPABILITIES["campaign"].label[not zh], exact=True
        ).locator("..").click()
        toolbar = page.locator(".module-template:visible")
        expect(toolbar.locator(".example-case-name")).to_contain_text("STAT6")
        with page.expect_response(
            lambda response: (
                response.request.method == "POST"
                and response.url.split("?")[0].endswith("/api/examples/campaign/prepare")
            )
        ) as preparation:
            toolbar.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        assert preparation.value.ok
        prepared = preparation.value.json()
        draft = prepared["campaign_draft"]
        sequence = draft["targets"]["A"]
        assert len(sequence) == 847
        assert draft["binders"] == {"B": ""} and draft["cdr"] == {}
        expect(
            toolbar.get_by_role(
                "button", name="新建空白任务" if zh else "New blank task", exact=True
            )
        ).to_be_visible()
        assert page.locator("main .questionnaire > fieldset:visible").count() == 1
        value = prepared["objects"]["stat6_sequence"]
        source_url = base + "/api/assets/" + value["reference"]["asset_id"]
        original = page.request.get(source_url).body()
        header = original.decode().splitlines()[0][1:]
        assert "".join(original.decode().splitlines()[1:]) == sequence
        assert hashlib.sha256(original).hexdigest() == value["reference"]["sha256"]
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role(
            "list", name="资产与任务" if zh else "Assets and tasks", exact=True
        ).get_by_role(
            "button", name=("序列: " if zh else "Sequence: ") + value["label"], exact=True
        ).click()
        preview = page.get_by_role(
            "region", name="所选文件预览" if zh else "Selected file preview", exact=True
        )
        expect(preview.get_by_role("heading", name=header, exact=True)).to_be_visible()
        expect(
            preview.get_by_text("847 个位置" if zh else "847 positions", exact=True)
        ).to_be_visible()
        preview.get_by_role(
            "spinbutton", name="跳转位置" if zh else "Go to position", exact=True
        ).fill("847")
        preview.get_by_role("button", name="定位" if zh else "Go", exact=True).click()
        expect(
            preview.get_by_role("button", name=header + " · 847 " + sequence[-1], exact=True)
        ).to_have_attribute("aria-pressed", "true")
        for width in (1440, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            preview.scroll_into_view_if_needed()
            page.wait_for_function("() => document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=root / f"stat6-design-sequence-{width}.png")
        with page.expect_download() as download:
            preview.get_by_role(
                "button",
                name="下载此序列 FASTA" if zh else "Download this sequence FASTA",
                exact=True,
            ).click()
        exported = root / "stat6-design-input.fasta"
        download.value.save_as(exported)
        lines = exported.read_text().splitlines()
        assert lines[0] == ">" + header and "".join(lines[1:]) == sequence
        assert page.request.get(source_url).body() == original
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not submissions, submissions
        assert not errors, errors
        (root / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "source_sha256": hashlib.sha256(original).hexdigest(),
                    "positions": 847,
                    "generated_binder": False,
                    "new_scientific_jobs": 0,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
