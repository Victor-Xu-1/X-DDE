"""Current study controls and explicit archived native outputs; never execute science."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6.catalogue import verified_input
from server_tests.test_navigation_shell_browser import open_navigation, settings

EVIDENCE = Path("server_tests/evidence/template-controls")
CASES = [
    ("predict", ("结构预测", "Structure prediction")),
    ("admet.predict", ("性质与安全性", "Properties and safety")),
    ("del.analyze", ("DEL 研究", "DEL research")),
    ("campaign", ("生物药研究", "Biologics research")),
]


def test_default_english_and_language_selection_survive_refresh():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        expect(page.locator("html")).to_have_attribute("lang", "en")
        expect(page.get_by_role("navigation", name="Main navigation", exact=True)).to_be_visible()
        capture(page, "default-english-first-visit")
        settings(page, "en")
        expect(page.locator("#settings-language")).to_have_value("en")
        page.locator("#settings-language").select_option("zh")
        expect(page.locator("html")).to_have_attribute("lang", "zh-CN")
        page.reload()
        expect(page.get_by_role("navigation", name="主导航", exact=True)).to_be_visible()
        expect(page.locator("html")).to_have_attribute("lang", "zh-CN")
        settings(page, "zh")
        expect(page.locator("#settings-language")).to_have_value("zh")
        capture(page, "saved-chinese-language")
        page.locator("#settings-language").select_option("en")
        page.reload()
        expect(page.get_by_role("navigation", name="Main navigation", exact=True)).to_be_visible()
        expect(page.locator("html")).to_have_attribute("lang", "en")
        assert before == page.request.get(base + "/api/jobs").json()
        browser.close()


@pytest.fixture(
    params=[(language, width) for language in ("zh", "en") for width in (1440, 768, 390)]
)
def case_page(request):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    language, width = request.param
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda value: (
                submissions.append(value.url)
                if value.method == "POST"
                and value.url.split("?")[0].endswith(
                    ("/api/jobs", "/api/batches", "/api/deployment/operations")
                )
                else None
            ),
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        expect(page.locator("html")).to_have_attribute("lang", "en")
        if language == "zh":
            settings(page, "en")
            page.locator("#settings-language").select_option("zh")
        yield page, language, width
        assert not errors, errors
        assert not submissions, submissions
        assert before == page.request.get(base + "/api/jobs").json()
        browser.close()


def open_case(page, language, capability, labels):
    index = 0 if language == "zh" else 1
    open_navigation(page, language).get_by_role("button", name=labels[index], exact=True).click()
    page.get_by_role(
        "combobox", name="研究任务" if index == 0 else "Research task", exact=True
    ).select_option(capability)
    region = page.get_by_role(
        "region", name="模块使用模板" if index == 0 else "Module usage template", exact=True
    )
    expect(
        region.get_by_role(
            "button", name="使用此模板" if index == 0 else "Use this template", exact=True
        )
    ).to_be_enabled()
    return region


def study_detail(page, capability):
    response = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/examples/" + capability)
    assert response.ok, response.text()
    info = response.json()
    assert info["case"]["id"] == "stat6-defined-molecules"
    assert info["study"]["target"] == "STAT6"
    assert info["pin"] is None and info["record_pin"] is None
    assert not info["computed_result_available"]
    return info


def capture(page, name):
    page.screenshot(path=EVIDENCE / (name + ".png"))
    overflowing = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    if overflowing:
        elements = page.locator("main *").evaluate_all(
            """elements => elements.map(e => {
                const bounds = e.getBoundingClientRect();
                return {tag:e.tagName, class:e.getAttribute('class'),
                    text:e.textContent.slice(0,100), x:bounds.x,
                    right:bounds.right, width:bounds.width};
            }).filter(e => e.width > 0 &&
                (e.x < 0 || e.right > innerWidth + 1)).slice(0,30)"""
        )
        (EVIDENCE / (name + "-overflow.json")).write_text(
            json.dumps(elements, ensure_ascii=False, indent=2)
        )
    assert not overflowing, name


def test_current_study_controls_are_coherent_and_keyboard_return_is_exact(case_page):
    page, language, width = case_page
    index = 0 if language == "zh" else 1
    measurements = []
    for capability, labels in CASES:
        region = open_case(page, language, capability, labels)
        info = study_detail(page, capability)
        expect(region.locator(".example-case-name")).to_contain_text(info["case"]["label"][index])
        expect(
            region.get_by_role(
                "button", name="示例结果" if index == 0 else "Example results", exact=True
            )
        ).to_have_count(0)
        kind = ("查看研究材料", "Preview study inputs")
        trigger = region.get_by_role("button", name=kind[index], exact=True)
        capture(page, f"{language}-{width}-{capability}-input")
        expect(trigger).to_be_visible()
        trigger.click()
        title = region.locator(".example-case-title h2")
        expect(title).to_have_text(info["case"]["label"][index])
        expect(title).to_be_focused()
        expect(region.get_by_role("button", name=kind[index], exact=True)).to_have_count(0)
        badge = "研究材料预览" if index == 0 else "Reference input preview"
        expect(region.locator(".example-result-kind")).to_have_text(badge)
        result = region.locator(".module-example-result")
        expect(result).to_be_visible()
        preview = result.locator(".study-input-preview")
        expect(preview).to_be_visible()
        expect(preview.locator("table")).to_contain_text("STAT6 · P42226")
        expect(preview.locator(".study-geometry-note")).to_contain_text("MMFF94s")
        if capability == "predict":
            expect(result.locator(".viewer-tools").first).to_be_visible(timeout=45000)
        if capability in {"admet.predict", "del.analyze"}:
            preview.get_by_role("button", name="2D", exact=True).click()
            expect(preview.locator(".molecule-image")).to_have_attribute(
                "data-drawing-state", "ready", timeout=45000
            )
        if capability == "predict":
            expect(
                page.get_by_role("group", name="工作区" if index == 0 else "Workspace", exact=True)
            ).to_have_count(0)
        capture(page, f"{language}-{width}-{capability}-result")
        summary = region.locator(".example-guide summary")
        summary.click()
        expect(region.locator(".example-guide-content")).to_be_visible()
        bounds = region.locator(".example-guide-content").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width + 1
        capture(page, f"{language}-{width}-{capability}-guide")
        page.keyboard.press("Escape")
        expect(summary).to_be_focused()
        expect(region.locator(".example-guide-content")).not_to_be_visible()
        region.get_by_role(
            "button", name="返回任务填写" if index == 0 else "Return to task form", exact=True
        ).click()
        expect(trigger).to_be_focused()
        expect(result).to_have_count(0)
        measurements.append(
            {
                "capability": capability,
                "language": language,
                "width": width,
                "computed_result_available": False,
                "exact_case": info["case"]["id"],
                "keyboard_return": True,
            }
        )
    (EVIDENCE / f"case-context-{language}-{width}.json").write_text(
        json.dumps(measurements, ensure_ascii=False, indent=2)
    )


def test_archived_results_keep_original_identity_outside_the_active_study(case_page):
    page, language, width = case_page
    index = 0 if language == "zh" else 1
    base = os.environ["WB_BROWSER_URL"]
    measurements = []
    for capability, _ in CASES:
        current = study_detail(page, capability)
        response = page.request.get(base + "/api/examples/" + capability + "?profile=archive")
        assert response.ok, response.text()
        archived = response.json()
        assert archived["case"]["id"] != current["case"]["id"]
        assert archived["module"]["revision"] + 1 == current["module"]["revision"]
        if capability == "campaign":
            pin = archived["record_pin"]
            assert pin and not pin["computed_result_available"]
            assert not archived["computed_result_available"]
            plans = page.request.get(base + "/api/harness/plans").json()
            plan = next(item for item in plans if item["id"] == pin["record_id"])
            assert plan["state"] == "validated" and plan["task_id"] is None
            measurements.append({"capability": capability, "validated_plan": plan["id"]})
        else:
            pin = archived["pin"]
            assert archived["computed_result_available"] and pin and pin["artifact_sha256"]
            job_id = pin["job_id"]
            job = page.request.get(base + "/api/jobs/" + job_id).json()
            assert job["status"] == "succeeded"
            identity = page.request.get(base + f"/api/task-history/{job_id}/identity").json()
            assert identity["origin"] == "fixed_example"
            assert archived["case"]["id"] in {case["id"] for case in identity["example_cases"]}
            # Retained results open through the actual task route, never as STAT6 outputs.
            page.goto(base + "/#task=" + job_id)
            if capability == "predict":
                page.locator(".execution-detail > summary").click()
            detail = page.locator(".detail-panel")
            expect(detail).to_be_visible()
            expect(detail.locator(".panel-heading h2")).to_contain_text(
                archived["case"]["label"][index]
            )
            if capability == "predict":
                expect(page.locator(".candidate-panel table")).to_be_visible(timeout=30000)
                expect(page.locator(".candidate-panel tbody tr").first).to_be_visible(timeout=30000)
                expect(page.locator(".candidate-state.error-box")).to_have_count(0)
                expect(page.locator(".viewer-tools").first).to_be_visible(timeout=45000)
            else:
                expect(detail.locator("table").first).to_be_visible(timeout=30000)
                expect(detail.locator(".molecule-image").first).to_have_attribute(
                    "data-drawing-state", "ready", timeout=45000
                )
            capture(page, f"{language}-{width}-{capability}-archived-result")
            assert page.request.get(base + "/api/jobs/" + job_id).json() == job
            measurements.append({"capability": capability, "job_id": job_id})
        assert (
            page.request.get(base + "/api/examples/" + capability + "?profile=archive").json()
            == archived
        )
        assert study_detail(page, capability) == current
    (EVIDENCE / f"archive-identity-{language}-{width}.json").write_text(
        json.dumps(measurements, ensure_ascii=False, indent=2)
    )


def test_failed_metadata_retry_and_public_preview_preserve_real_sequence_input(case_page):
    page, language, width = case_page
    index = 0 if language == "zh" else 1
    failing = True

    def metadata(route):
        if failing:
            route.fulfill(
                status=503,
                content_type="application/json",
                body='{"detail":"ConnectionRefused: /srv/internal/service.log"}',
            )
        else:
            route.continue_()

    page.route("**/api/examples/predict", metadata)
    # A reload exercises a genuine failed initial read, not a preloaded case.
    page.reload()
    open_navigation(page, language).get_by_role(
        "button", name=CASES[0][1][index], exact=True
    ).click()
    alert = page.get_by_role("alert").filter(
        has_text="案例说明暂不可用" if index == 0 else "Example guide unavailable"
    )
    expect(alert).to_be_visible()
    assert "ConnectionRefused" not in alert.inner_text() and "service.log" not in alert.inner_text()
    study_detail(page, "predict")
    sequence_value = "".join(
        line
        for line in verified_input("stat6_sequence").decode().splitlines()
        if not line.startswith(">")
    )
    assert len(sequence_value) == 847
    page.get_by_role(
        "radio", name="蛋白结构" if index == 0 else "Protein structure", exact=True
    ).check()
    page.get_by_role("button", name="下一步" if index == 0 else "Next", exact=True).click()
    sequence = page.locator(".questionnaire:visible textarea")
    sequence.fill(sequence_value)
    capture(page, f"{language}-{width}-failed-guide-preserved-input")
    failing = False
    alert.get_by_role("button", name="重试" if index == 0 else "Retry", exact=True).click()
    trigger = page.get_by_role(
        "button", name="查看研究材料" if index == 0 else "Preview study inputs", exact=True
    )
    expect(trigger).to_be_enabled()
    expect(sequence).to_have_value(sequence_value)
    trigger.click()
    expect(page.locator(".example-case-title h2")).to_be_focused()
    page.get_by_role(
        "button", name="返回任务填写" if index == 0 else "Return to task form", exact=True
    ).click()
    expect(sequence).to_be_visible()
    expect(sequence).to_have_value(sequence_value)
    expect(trigger).to_be_focused()
    if width == 390:
        settings(page, language)
        page.get_by_role("radio", name="深色" if index == 0 else "Dark", exact=True).check()
        region = open_case(page, language, "admet.predict", CASES[1][1])
        region.get_by_role(
            "button", name="查看研究材料" if index == 0 else "Preview study inputs", exact=True
        ).click()
        expect(region.locator(".module-example-result table").first).to_be_visible(timeout=30000)
        preview = region.locator(".study-input-preview")
        preview.get_by_role("button", name="2D", exact=True).click()
        expect(preview.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=45000
        )
        capture(page, f"{language}-{width}-dark-public-result")
