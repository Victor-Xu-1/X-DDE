"""Review real STAT6 inputs with native Ketcher, without starting scientific work."""

import base64
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401
from server_tests.molecular_review_capture import capture_input_review, launch_review_browser
from server_tests.publication_browser_helpers import export_figure
from server_tests.test_admet_workspace_browser import saved_workspace  # noqa: F401
from server_tests.test_navigation_shell_browser import open_navigation
from server_tests.utility_workspace_capture import (
    capture_utility_result,
    capture_utility_space,
    load_utility_template,
)

UTILITIES = {
    "properties": ("properties", "分子性质", "Molecular properties", ".properties-results"),
    "admet.predict": ("admet", "ADMET 预测", "ADMET prediction", ".admet-results"),
    "chemistry.states": (
        "states", "质子化与互变异构", "Protonation & tautomers", ".molecular-state-results",
    ),
    "chemistry.screen": (
        "screen", "相似性与结构筛查", "Similarity & structural alerts", ".discovery-results",
    ),
}


def source_for(request):
    if request["operation"] == "properties":
        return request["ligand_files"][0], None
    if request["operation"] == "library_screen":
        ref = request.get("query") or request["library"]
    else:
        ref = request["molecule"]
    return ref["asset_id"], ref.get("sha256")


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
@pytest.mark.parametrize("capability", [
    "properties", "admet.predict", "chemistry.states", "chemistry.screen",
])
def test_exact_molecular_input_workspace(admet_saved_workspace, capability, language, width):
    evidence = Path("outputs/molecular-review-workspace") / capability / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    errors, computations = [], []
    with platform(admet_saved_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = launch_review_browser(driver)
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.add_init_script(
                f"if (location.origin === {json.dumps(base)}) {{"
                f"localStorage.setItem('opendde-workbench.language', '{language}');}}"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: computations.append(request.url)
                    if request.method == "POST" and any(path in request.url for path in (
                        "/api/jobs", "/api/batches", "/runtime-controls/", "/research/poses/",
                    )) else None)
            before = page.request.get(base + "/api/jobs").json()
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="小工具" if zh else "Utilities", exact=True
            ).click()
            identifier, cn, en, result_selector = UTILITIES[capability]
            page.get_by_role("button", name=cn if zh else en, exact=True).click()
            utility = page.locator(f'[data-utility="{identifier}"]')
            expect(utility.locator(".molecular-input-review")).to_have_count(0)
            expect(utility.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            )).to_be_enabled()
            capture_utility_space(page, utility, evidence)
            prepared = load_utility_template(page, utility, capability, language, evidence)
            request = prepared["request"]
            identifier, digest = source_for(request)
            source_url = base + "/api/assets/" + identifier
            original = page.request.get(source_url).body()
            source_digest = hashlib.sha256(original).hexdigest()
            if digest:
                assert source_digest == digest
            expect(utility.locator(".questionnaire-steps")).to_have_count(0)
            expect(utility.get_by_role(
                "button", name="下一步" if zh else "Next", exact=True,
            )).to_have_count(0)
            review = page.locator(".molecular-input-review")
            drawing = review.locator(".molecule-image")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            expect(drawing.get_by_role("img")).to_be_visible()
            structure, summary = drawing.bounding_box(), review.locator(
                ".molecular-input-summary"
            ).bounding_box()
            assert structure and summary
            assert structure["y"] + structure["height"] <= summary["y"] + 1
            expect(review.locator(".molecular-input-summary")).not_to_have_attribute("open", "")
            review.locator(".molecular-input-summary > summary").click()
            expect(review.locator(".molecular-input-summary")).to_have_attribute("open", "")
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            encoded = drawing.get_by_role("img").get_attribute("src")
            vector = base64.b64decode(encoded.split(",", 1)[1])
            svg = ET.fromstring(vector)
            assert svg.findall(".//{http://www.w3.org/2000/svg}path")
            assert "CH3" not in "".join(svg.itertext())
            (evidence / "review-structure.svg").write_bytes(vector)

            drawing.get_by_role("button", name="放大预览" if zh else "Zoom in preview",
                                exact=True).click()
            expect(drawing.locator(".figure-preview-sheet")).to_have_attribute("data-zoom", "2")
            drawing.get_by_role(
                "button", name="适应窗口" if zh else "Fit preview", exact=True
            ).click()
            expect(drawing.locator(".figure-preview-sheet")).to_have_attribute("data-zoom", "1")

            if capability == "properties" and language == "en":
                # Transport failure must not turn into loss of the selected molecule or summary.
                page.route(source_url, lambda route: route.fulfill(status=503, body="Unavailable"))
                drawing.get_by_role("combobox", name="2D drawing line weight").select_option("2.2")
                expect(drawing).to_have_attribute(
                    "data-drawing-state", "unavailable", timeout=45000
                )
                expect(review.locator(".molecular-input-summary")).to_contain_text("STAT6")
                page.unroute(source_url)
                drawing.get_by_role("button", name=re.compile(r"^Retry drawing · ")).click()
                expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
                exported = export_figure(
                    page, drawing.get_by_role("button", name="Export figure ↓", exact=True),
                    evidence, "native-input-figure", language, "SVG",
                )
                assert ET.fromstring(exported.read_bytes()).findall(
                    ".//{http://www.w3.org/2000/svg}path"
                )
                drawing.get_by_role("combobox", name="2D drawing line weight").select_option("1.6")
                expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            capture_input_review(page, review, evidence)
            utility.locator(".single-page-options > summary").click()
            utility.locator(".single-page-options > summary").click()
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            # The saved result stays inside this utility and does not replace its input.
            info = page.request.get(base + "/api/examples/" + capability).json()
            job = info["pin"]["job_id"]
            with page.expect_response(f"**/api/jobs/{job}/result") as saved_response:
                utility.get_by_role(
                    "button", name="示例结果" if zh else "Example results", exact=True
                ).click()
            assert saved_response.value.ok
            result = utility.locator(".module-example-result")
            expect(result.locator(result_selector)).to_be_visible(timeout=45000)
            capture_utility_result(page, result, saved_response.value.json(), language, evidence)
            utility.get_by_role(
                "button", name="返回任务填写" if zh else "Return to task form", exact=True
            ).click()
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            # Visiting a different tool preserves this form's reviewed source and step.
            page.get_by_role(
                "button", name="透脑评估" if zh else "Brain penetration", exact=True
            ).click()
            expect(page.locator('[data-utility="brain"] .molecular-input-review')).to_have_count(0)
            page.get_by_role("button", name=cn if zh else en, exact=True).click()
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            utility.get_by_role(
                "button", name="新建空白任务" if zh else "New blank task", exact=True
            ).click()
            expect(utility.locator(".molecular-input-review")).to_have_count(0)
            expect(utility.get_by_role(
                "button", name="新建空白任务" if zh else "New blank task", exact=True
            )).to_have_count(0)
            assert hashlib.sha256(page.request.get(source_url).body()).hexdigest() == source_digest
            assert page.request.get(base + "/api/jobs").json() == before
            assert not errors and not computations, {"errors": errors, "computations": computations}
            browser.close()
