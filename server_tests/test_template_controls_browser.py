"""Public case controls over archived native outputs; never execute science."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import open_navigation, settings

EVIDENCE = Path("server_tests/evidence/template-controls")
CASES = [
    ("predict", ("结构预测", "Structure prediction")),
    ("admet.predict", ("性质与安全性", "Properties and safety")),
    ("del.analyze", ("DEL 研究", "DEL research")),
    ("campaign", ("生物药研究", "Biologics research")),
]


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
        if language == "en":
            settings(page, "zh")
            page.locator("#settings-language").select_option("en")
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


def test_native_case_controls_are_coherent_and_keyboard_return_is_exact(case_page):
    page, language, width = case_page
    index = 0 if language == "zh" else 1
    measurements = []
    for capability, labels in CASES:
        region = open_case(page, language, capability, labels)
        info = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/examples/" + capability).json()
        expect(region.locator(".example-case-name")).to_contain_text(info["case"]["label"][index])
        setup = bool(info.get("record_pin") and not info["record_pin"]["computed_result_available"])
        kind = ("配置示例", "Setup example") if setup else ("示例结果", "Example results")
        trigger = region.get_by_role("button", name=kind[index], exact=True)
        capture(page, f"{language}-{width}-{capability}-input")
        expect(trigger).to_be_visible()
        trigger.click()
        title = region.locator(".example-case-title h2")
        expect(title).to_have_text(info["case"]["label"][index])
        expect(title).to_be_focused()
        expect(region.get_by_role("button", name=kind[index], exact=True)).to_have_count(0)
        badge = (
            "配置示例"
            if setup and index == 0
            else "Setup example"
            if setup
            else "公开示例"
            if index == 0
            else "Public example"
        )
        expect(region.locator(".example-result-kind")).to_have_text(badge)
        result = region.locator(".module-example-result")
        expect(result).to_be_visible()
        if capability != "campaign":
            expect(result.locator("table").first).to_be_visible(timeout=30000)
        if capability in {"predict", "admet.predict"}:
            expect(result.locator(".viewer-tools").first).to_be_visible(timeout=45000)
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
                "setup_only": setup,
                "exact_case": info["case"]["id"],
                "keyboard_return": True,
            }
        )
    (EVIDENCE / f"case-context-{language}-{width}.json").write_text(
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
    info = page.request.get(os.environ["WB_BROWSER_URL"] + "/api/examples/predict").json()
    job = page.request.get(
        os.environ["WB_BROWSER_URL"] + "/api/jobs/" + info["pin"]["job_id"]
    ).json()
    sequence_value = next(
        item["value"] for item in job["request"]["components"] if item["kind"] == "protein"
    )
    assert len(sequence_value) > 80
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
        "button", name="示例结果" if index == 0 else "Example results", exact=True
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
            "button", name="示例结果" if index == 0 else "Example results", exact=True
        ).click()
        expect(region.locator(".module-example-result table").first).to_be_visible(timeout=30000)
        capture(page, f"{language}-{width}-dark-public-result")
