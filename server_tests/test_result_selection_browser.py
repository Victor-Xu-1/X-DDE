"""Real retained molecule/pose selection and shared navigation; never execute science."""

import json
import os
from urllib.parse import urlencode

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import open_navigation, settings
from server_tests.test_pocket_results_browser import EVIDENCE


@pytest.mark.parametrize("capability", ["properties", "admet.predict", "gnina.dock"])
@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_record_cells_and_keyboard_update_the_exact_inspector(capability, language):
    base = os.environ["WB_BROWSER_URL"]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base)
        before_jobs = page.request.get(base + "/api/jobs").json()
        if zh:
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        info = page.request.get(base + "/api/examples/" + capability + "?profile=archive").json()
        job_id = info["pin"]["job_id"]
        result_url = base + f"/api/jobs/{job_id}/result"
        native = page.request.get(result_url).json()
        page.goto(base + "#task=" + job_id)
        table = page.get_by_role("main").locator(".research-table").first
        expect(table).to_be_visible()
        candidates = table.locator("tbody tr.is-selectable")
        expect(candidates.nth(1)).to_be_visible()
        target = candidates.nth(1)
        target.locator("td.numeric-cell").first.click()
        expect(target).to_have_attribute("aria-selected", "true")
        # Let the actual client polling complete before checking that it retained
        # the chosen record. This is a bounded observation, never a resubmission.
        with page.expect_response(
            lambda response: (
                response.url == base + "/api/jobs" and response.request.method == "GET"
            ),
            timeout=15000,
        ) as poll:
            page.wait_for_timeout(3500)
        assert poll.value.ok
        expect(target).to_have_attribute("aria-selected", "true")
        if capability == "properties":
            expect(page.locator(".properties-results .result-inspector > header h3")).to_have_text(
                ("分子 " if zh else "Molecule ") + "2"
            )
        elif capability == "admet.predict":
            selected = page.get_by_role(
                "region", name="所选分子" if zh else "Selected molecule", exact=True
            )
            expect(selected).to_contain_text(native["rows"][1]["name"])
        else:
            poses = [pose for pose in native["poses"] if pose["valid"] and pose.get("artifact")]
            assert len(poses) >= 2
            expect(
                page.get_by_role(
                    "link",
                    name="下载所选姿势 SDF" if zh else "Download selected pose SDF",
                    exact=True,
                )
            ).to_have_attribute(
                "href",
                "/api/jobs/" + job_id + "/download?" + urlencode({"name": poses[1]["artifact"]}),
            )
        page.screenshot(path=EVIDENCE / f"{language}-{capability}-row-selection.png")
        candidates.first.focus()
        page.keyboard.press("Enter")
        expect(candidates.first).to_have_attribute("aria-selected", "true")
        expect(target).to_have_attribute("aria-selected", "false")
        assert page.request.get(result_url).json() == native
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert not errors and not submissions, {"errors": errors, "submissions": submissions}
        (EVIDENCE / f"{language}-{capability}-selection.json").write_text(
            json.dumps(
                {
                    "job_id": job_id,
                    "capability": capability,
                    "language": language,
                    "native_records_preserved": True,
                    "scientific_execution": False,
                },
                indent=2,
            )
        )
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
def test_every_task_entry_and_available_backend_switch_updates_the_visible_task(language):
    """Entry/switch controls only; no materials, uploads, submissions or calculations."""
    base = os.environ["WB_BROWSER_URL"]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions, inspected = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base)
        before_jobs = page.request.get(base + "/api/jobs").json()
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        all_name = "全部能力" if language == "zh" else "All capabilities"
        open_navigation(page, language).get_by_role("button", name=all_name, exact=True).click()
        cards = page.locator("button[data-capability]")
        expect(cards.first).to_be_attached()
        identifiers = list(
            dict.fromkeys(
                cards.evaluate_all(
                    "elements => elements.map(element => element.dataset.capability)"
                )
            )
        )
        assert len(identifiers) >= 74
        for capability in identifiers:
            (EVIDENCE / f"{language}-entry-progress.json").write_text(
                json.dumps({"current": capability, "completed": inspected}, indent=2)
            )
            open_navigation(page, language).get_by_role("button", name=all_name, exact=True).click()
            card = page.locator('button[data-capability="' + capability + '"]').first
            if not card.is_visible():
                card.locator("xpath=ancestor::details").locator("summary").click()
            card.click()
            template = page.get_by_role(
                "region",
                name="模块使用模板" if language == "zh" else "Module usage template",
                exact=True,
            )
            expect(template).to_contain_text("STAT6")
            picker = page.locator(".module-task-picker select").first
            if picker.count():
                expect(picker).to_have_value(capability)
            methods = page.locator(".task-model-switch")
            expect(methods).to_have_count(1)
            expect(methods.locator('button[aria-pressed="true"]')).to_have_count(1)
            buttons = methods.locator("button[aria-pressed]")
            switched = False
            if buttons.count() > 1:
                index = 1 if buttons.nth(0).get_attribute("aria-pressed") == "true" else 0
                buttons.nth(index).click()
                expect(buttons.nth(index)).to_have_attribute("aria-pressed", "true")
                switched = True
            inspected.append({"capability": capability, "backend_switch": switched})
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert not errors and not submissions, {"errors": errors, "submissions": submissions}
        (EVIDENCE / f"{language}-all-task-entry-switches.json").write_text(
            json.dumps({"entries": inspected, "scientific_execution": False}, indent=2)
        )
        page.screenshot(path=EVIDENCE / f"{language}-last-task-entry.png")
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
def test_shared_sidebar_switches_every_destination_from_an_existing_result(language):
    base = os.environ["WB_BROWSER_URL"]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base)
        before_jobs = page.request.get(base + "/api/jobs").json()
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        info = page.request.get(base + "/api/examples/p2rank.detect?profile=archive").json()
        page.goto(base + "#task=" + info["pin"]["job_id"])
        expect(page.locator(".pocket-explorer")).to_be_visible()
        nav = open_navigation(page, language)
        names = [text.strip() for text in nav.get_by_role("button").all_text_contents()]
        assert len(names) == 13
        for name in names:
            nav.get_by_role("button", name=name, exact=True).click()
            expect(page.get_by_role("banner")).to_contain_text(name)
            expect(page.locator(".pocket-explorer")).to_have_count(0)
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert not errors and not submissions
        page.screenshot(path=EVIDENCE / f"{language}-navigation-after-result.png")
        browser.close()
