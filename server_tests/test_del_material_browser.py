"""DEL material-source transitions in the real UI; no analysis or scientific submission."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_del_materials_one_question_source_identity_and_backend_label(tmp_path, language, width):
    evidence = Path("outputs/del-materials")
    evidence.mkdir(parents=True, exist_ok=True)
    counts = tmp_path / "DEL-target-reference-counts.csv"
    counts.write_text("DEL_ID,T1,T2,NTC1,NTC2\n1_1_1,42,39,4,3\n1_2_1,9,8,6,7\n")
    with platform(tmp_path / "state", evidence / f"{language}-{width}.log") as base:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
            errors, submissions = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: (
                    submissions.append(request.url)
                    if request.method == "POST" and request.url.endswith("/api/jobs")
                    else None
                ),
            )
            page.goto(base)
            open_navigation(page, language)
            page.get_by_role(
                "button", name="DEL research" if language == "en" else "DEL 研究", exact=True
            ).click()
            module = page.get_by_role(
                "region",
                name="DEL enrichment and hits" if language == "en" else "DEL 富集与命中",
                exact=True,
            )
            group = module.get_by_role(
                "radiogroup", name="Material source" if language == "en" else "材料来源"
            )
            expect(group).to_have_count(1)
            expect(group.get_by_role("radio")).to_have_count(3)
            expect(
                group.get_by_role(
                    "radio", name="New count table" if language == "en" else "上传新计数表"
                )
            ).to_be_checked()
            expect(module.locator(".dataset-source-tabs")).to_have_count(0)
            page.get_by_label(
                "DEL count table" if language == "en" else "DEL 计数表", exact=True
            ).set_input_files(counts)
            expect(
                module.locator(".dataset-selected-file").get_by_text(counts.name, exact=True)
            ).to_be_visible(timeout=15000)
            selected = page.request.get(base + "/api/assets").json()
            original = next(asset for asset in selected if asset["name"] == counts.name)
            group.get_by_role(
                "radio", name="Historical file" if language == "en" else "历史文件", exact=True
            ).check()
            history = module.get_by_role(
                "combobox", name="DEL count table" if language == "en" else "DEL 计数表", exact=True
            )
            expect(history.get_by_role("option", name=counts.name, exact=False)).to_be_attached()
            history.select_option(original["id"])
            expect(
                module.locator(".dataset-selected-file").get_by_text(counts.name, exact=True)
            ).to_be_visible()
            expect(
                module.get_by_role(
                    "button", name="Next" if language == "en" else "下一步", exact=True
                )
            ).to_be_enabled()
            group.get_by_role(
                "radio",
                name="Completed count result" if language == "en" else "历史计数结果",
                exact=True,
            ).check()
            expect(history).to_have_count(0)
            expect(module.get_by_text(counts.name, exact=True)).to_have_count(0)
            expect(
                module.get_by_role(
                    "button", name="Next" if language == "en" else "下一步", exact=True
                )
            ).to_be_disabled()
            group.get_by_role(
                "radio", name="New count table" if language == "en" else "上传新计数表", exact=True
            ).check()
            active = module.locator(".questionnaire > fieldset:not([hidden])")
            expect(active).to_have_css("transform", "none")
            expect(active).to_have_css("opacity", "1")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(
                path=str(evidence / f"{language}-{width}-materials.png"), full_page=True
            )
            retained = page.request.get(base + "/api/assets").json()
            assert (
                next(asset for asset in retained if asset["id"] == original["id"])["sha256"]
                == original["sha256"]
            )
            assert (
                not page.request.get(base + "/api/jobs").json() and not submissions and not errors
            )
            (evidence / f"{language}-{width}-scope.json").write_text(
                json.dumps(
                    {
                        "controlled_count_table_for_ui_only": True,
                        "scientific_analysis": False,
                        "new_scientific_jobs": 0,
                        "original_file_retained": True,
                        "single_material_question": True,
                    }
                )
            )
            browser.close()
