"""Real Ketcher scaffold review and questionnaire edits; never submit a scientific job."""

import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6.catalogue import FILES
from server_tests.test_navigation_shell_browser import open_navigation

SCAFFOLD = "CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1"


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 1040), ("en", 390)])
def test_reinvent_exact_chemical_scope_and_review(language, width):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/reinvent-review")
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and "/api/jobs" in request.url
                else None
            ),
        )
        page.goto(base)
        jobs_before = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="小分子设计" if zh else "Small-molecule design", exact=True
        ).click()
        page.get_by_role(
            "combobox", name="研究任务" if zh else "Research task", exact=True
        ).select_option("reinvent.design")
        page.get_by_role(
            "combobox",
            name="想怎样设计分子？" if zh else "How would you like to design molecules?",
            exact=True,
        ).select_option("r_groups")
        fragments = page.get_by_role(
            "textbox",
            name="片段结构（每行一个）" if zh else "Fragment structures (one per line)",
            exact=True,
        )
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_disabled()
        fragments.fill(SCAFFOLD)
        next_button.click()
        scope = page.get_by_role(
            "region", name="分子设计范围" if zh else "Molecular design scope", exact=True
        )
        drawing = scope.locator(".molecule-image")
        expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        expect(drawing.get_by_role("img")).to_be_visible()
        expect(
            scope.get_by_text(
                "按图中 * / R 标记的位置设计" if zh else "Design at the marked sites (* / R)",
                exact=True,
            )
        ).to_be_visible()
        page.screenshot(path=evidence / f"scope-{language}-{width}.png", full_page=True)
        next_button.click()
        page.get_by_role("radio", name="20 个候选" if zh else "20 candidates", exact=True).check()
        page.get_by_role("button", name="专家微调" if zh else "Expert tuning", exact=True).click()
        page.get_by_role("spinbutton", name="随机种子" if zh else "Random seed", exact=True).fill(
            "2026"
        )
        page.get_by_role(
            "spinbutton", name="内存上限（MiB）" if zh else "Memory budget (MiB)", exact=True
        ).fill("2048")
        next_button.click()
        review = page.get_by_role(
            "table", name="设计方案核对" if zh else "Design plan review", exact=True
        )
        expect(
            review.get_by_role(
                "row", name="候选预算 20" if zh else "Candidate budget 20", exact=True
            )
        ).to_be_visible()
        expect(review.get_by_text("2026", exact=True)).to_be_visible()
        expect(
            review.get_by_text(
                "CPU · 2 核 · 2048 MiB" if zh else "CPU · 2 cores · 2048 MiB", exact=True
            )
        ).to_be_visible()
        expect(scope.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=60000
        )
        page.screenshot(path=evidence / f"review-{language}-{width}.png", full_page=True)
        page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        page.get_by_role("radio", name="50 个候选" if zh else "50 candidates", exact=True).check()
        next_button.click()
        expect(
            review.get_by_role(
                "row", name="候选预算 50" if zh else "Candidate budget 50", exact=True
            )
        ).to_be_visible()
        if width >= 1400:
            image_box = scope.locator(".structure-workbench-view").bounding_box()
            table_box = review.bounding_box()
            assert image_box["x"] < table_box["x"] and image_box["width"] >= 420
            export_box = scope.get_by_role(
                "button", name="Export figure ↓", exact=True
            ).bounding_box()
            actions = page.locator(".questionnaire:visible .questionnaire-actions")
            expect(actions).to_have_count(1)
            actions_box = actions.bounding_box()
            assert export_box["y"] + export_box["height"] <= actions_box["y"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert not errors and not submissions
        assert page.request.get(base + "/api/jobs").json() == jobs_before
        browser.close()


def test_explicit_stat6_template_source_survives_mode_changes_without_submitting():
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/reinvent-review")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        open_navigation(page, "en").get_by_role(
            "button", name="Small-molecule design", exact=True
        ).click()
        page.get_by_role("combobox", name="Research task", exact=True).select_option(
            "reinvent.design"
        )
        next_button = page.get_by_role("button", name="Next", exact=True)
        expect(next_button).to_be_disabled()
        page.get_by_role("button", name="Use this template", exact=True).click()
        expect(page.get_by_role("button", name="New blank task", exact=True)).to_be_visible(
            timeout=45000
        )
        expect(next_button).to_be_enabled(timeout=45000)
        mode = page.get_by_role(
            "combobox", name="How would you like to design molecules?", exact=True
        )
        mode.select_option("r_groups")
        source_check = page.get_by_role(
            "checkbox", name="Verify the scaffold's source molecule", exact=True
        )
        expect(source_check).to_be_checked()
        page.get_by_role("textbox", name="Fragment structures (one per line)", exact=True).fill(
            SCAFFOLD
        )
        next_button.click()
        review = page.get_by_role("table", name="Design plan review")
        expect(
            review.get_by_role(
                "row",
                name="Scaffold source molecule " + FILES["study_ligand"].name + " · Record 1",
                exact=True,
            )
        ).to_be_visible(timeout=45000)
        page.screenshot(path=evidence / "explicit-stat6-scaffold-origin.png", full_page=True)
        page.get_by_role("button", name="Back", exact=True).click()
        source_check.uncheck()
        next_button.click()
        expect(review.get_by_text("Scaffold source molecule", exact=True)).to_have_count(0)
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors
        browser.close()
