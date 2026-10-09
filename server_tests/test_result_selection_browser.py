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
        table = page.locator(".result-master-detail .research-table").first
        expect(table).to_be_visible()
        candidates = table.locator("tbody tr.is-selectable")
        expect(candidates.nth(1)).to_be_visible()
        target = candidates.nth(1)
        target.locator("td.numeric-cell").first.click()
        expect(target).to_have_attribute("aria-selected", "true")
        if capability == "properties":
            expect(page.locator(".properties-results .result-inspector h3")).to_have_text(
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
