"""Reuse the exact restored STAT6 model's evidence without new prediction or training."""

import hashlib
import json
from pathlib import Path

import pytest
from browser_platform import platform
from playwright.sync_api import expect, sync_playwright
from test_navigation_shell_browser import open_navigation
from test_property_model_review_browser import model_review_fixture  # noqa: F401


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_reused_model_keeps_native_negative_evidence_and_preserves_the_draft(
    request, language, width
):
    # Reuse the registered native-data fixture; no duplicate model preparation.
    settings, job, native, _ = request.getfixturevalue("model_review_fixture")
    zh = language == "zh"
    evidence = Path("server_tests/evidence/property-model-reuse") / language
    evidence.mkdir(parents=True, exist_ok=True)
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        before = page.request.get(base + "/api/jobs").json()
        source = page.request.get(base + "/api/scientific/property-models/" + job["id"])
        assert source.ok
        model = source.json()
        assert model["validation_records"] == len(native["validation_points"]) == 16
        assert model["validation_metrics"] == native["metrics"]
        output = settings.state_dir / "jobs" / job["id"] / "output"
        assert (
            model["source_report_sha256"]
            == hashlib.sha256((output / "result.json").read_bytes()).hexdigest()
        )
        errors, mutations = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.context.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="性质与安全性" if zh else "Properties and safety", exact=True
        ).click()
        page.locator(".module-task-picker select:visible").select_option("chemprop.predict")
        picker = page.get_by_role(
            "combobox", name="选择已训练的研究模型" if zh else "Choose a trained research model"
        )
        expect(picker).to_be_enabled()
        expect(picker).to_have_value("")
        picker.select_option(job["id"])
        context = page.get_by_role(
            "region", name="所选模型的训练证据" if zh else "Selected model training evidence"
        )
        expect(context).to_be_visible()
        expect(context.get_by_role("status")).to_contain_text(
            "测试表现不足" if zh else "Insufficient held-out performance"
        )
        expect(context).to_contain_text("-0.1937")
        expect(context).to_contain_text("0.9588 pKd")
        assert model["sha256"] not in context.inner_text()
        page.screenshot(path=str(evidence / "selected-native-model-evidence.png"), full_page=True)
        with page.context.expect_page() as opened:
            context.get_by_role(
                "link", name="查看原始训练结果" if zh else "Review original training results"
            ).click()
        training = opened.value
        review = training.get_by_role(
            "region", name="性质模型测试集复核" if zh else "Property model held-out review"
        )
        expect(review).to_be_visible(timeout=30000)
        expect(review.get_by_role("status").filter(has_text="R² ≤ 0")).to_be_visible()
        expect(review.locator(".molecule-image")).to_have_attribute(
            "data-drawing-state", "ready", timeout=60000
        )
        expect(
            training.get_by_role("link", name="property-model.pt", exact=True)
        ).to_have_attribute("href", f"/api/jobs/{job['id']}/download?name=property-model.pt")
        training.close()
        expect(picker).to_have_value(job["id"])
        expect(context).to_be_visible()
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not mutations
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "source_job": job["id"],
                    "model_sha256": model["sha256"],
                    "source_report_sha256": model["source_report_sha256"],
                    "native_negative_evidence_preserved": True,
                    "current_form_preserved": True,
                    "new_prediction_or_training": False,
                    "language": language,
                    "api_mutations": mutations,
                    "page_errors": errors,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
