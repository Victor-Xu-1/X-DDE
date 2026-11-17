"""Inspect native BBB outputs and prepare inputs while prediction engines remain off."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import capture_input_review, launch_review_browser
from server_tests.test_admet_workspace_browser import saved_workspace  # noqa: F401
from server_tests.test_navigation_shell_browser import open_navigation

IDS = (
    "BBB_Martins", "PAMPA_NCATS", "Pgp_Broccatelli", "Lipophilicity_AstraZeneca",
    "Solubility_AqSolDB", "PPBR_AZ", "Caco2_Wang",
)


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_brain_input_and_native_bbb_inspection(admet_saved_workspace, language, width):
    evidence = Path("outputs/brain-profile") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, calculations = [], []
    with platform(admet_saved_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = launch_review_browser(driver)
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(
                f"if (location.origin === {json.dumps(base)}) {{"
                f"localStorage.setItem('opendde-workbench.language','{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda req: calculations.append(req.url)
                    if req.method == "POST" and any(value in req.url for value in (
                        "/api/jobs", "/runtime-controls/", "/research/poses/",
                    )) else None)
            before = page.request.get(base + "/api/jobs").json()
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="小工具" if zh else "Utilities", exact=True
            ).click()
            page.get_by_role(
                "button", name="透脑评估" if zh else "Brain penetration", exact=True
            ).click()
            utility = page.locator('[data-utility="brain"]')
            expect(utility).to_be_visible()
            expect(utility.get_by_role(
                "radio", name="一个研究分子" if zh else "One research molecule"
            )).to_be_checked()
            metadata = page.request.get(base + "/api/examples/admet.brain").json()
            assert metadata["case"]["id"] == "stat6-defined-molecules"
            assert not metadata["computed_result_available"]
            with page.expect_response("**/api/examples/admet.brain/prepare") as response:
                utility.get_by_role(
                    "button", name="使用此模板" if zh else "Use this template", exact=True
                ).click()
            prepared = response.value.json()
            assert prepared["request"]["focus"] == "brain"
            assert prepared["request"]["operation"] == "admet_predict"
            expect(utility.locator(".questionnaire-steps")).to_have_count(0)
            utility.locator(".single-page-options > summary").click()
            expect(utility.get_by_role(
                "button", name="开始透脑评估" if zh else "Assess brain penetration", exact=True
            )).to_be_disabled()
            expect(utility).to_contain_text("ADMET-AI")
            review = utility.locator(".molecular-input-review")
            drawing = review.locator(".molecule-image")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            structure = drawing.bounding_box()
            summary = review.locator(".molecular-input-summary").bounding_box()
            assert structure and summary
            assert structure["y"] + structure["height"] <= summary["y"] + 1
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            capture_input_review(page, review, evidence)

            # A BBB view of a real ADMET result is not a newly computed brain task.
            page.get_by_role(
                "button", name="ADMET 预测" if zh else "ADMET prediction", exact=True
            ).click()
            page.get_by_role(
                "button", name="示例结果" if zh else "Example results", exact=True
            ).click()
            result = page.locator(".admet-results")
            info = page.request.get(base + "/api/examples/admet.predict").json()
            identifier = info["pin"]["job_id"]
            native = page.request.get(base + f"/api/jobs/{identifier}/result").json()
            assert native["models_executed"] and len(native["endpoints"]) == 41
            result.get_by_role(
                "combobox", name="结果分组" if zh else "Result group"
            ).select_option("brain")
            table = result.locator(".admet-endpoint-scroll table")
            expect(table.locator("tbody tr")).to_have_count(7)
            assert table.locator("tbody tr").first.get_attribute("data-endpoint-id") == IDS[0]
            for key in IDS:
                row = table.locator('[data-endpoint-id="' + key + '"]')
                actual = float(row.locator(".admet-endpoint-value strong").get_attribute("title"))
                assert actual == native["rows"][0]["predictions"][key]
            expect(result.locator(".admet-brain-scope")).to_contain_text(
                "不是底物或外排比" if zh else "not substrate status or efflux ratio"
            )
            selected = result.locator(".admet-selected-molecule")
            selected.get_by_role(
                "tab", name="三维结构" if zh else "3D structure", exact=True
            ).click()
            expect(selected.locator(".molecular-stage iframe")).to_be_visible(timeout=30000)
            expect(table.locator("tbody tr")).to_have_count(7)
            with page.expect_download() as transfer:
                selected.get_by_role(
                    "link", name="下载预测表" if zh else "Download prediction table"
                ).click()
            path = evidence / "predictions.csv"
            transfer.value.save_as(path)
            assert hashlib.sha256(path.read_bytes()).hexdigest() == native["csv_sha256"]
            page.screenshot(path=evidence / "native-bbb-workspace.png", full_page=True)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            page.get_by_role(
                "button", name="透脑评估" if zh else "Brain penetration", exact=True
            ).click()
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            assert page.request.get(base + "/api/jobs").json() == before
            assert not calculations and not errors, {"calculations": calculations, "errors": errors}
            browser.close()
