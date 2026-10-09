"""Controlled model-display contract with real ABL molecular identities; no training."""

import copy
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.landscape_browser_helpers import exercise_plot_view, responsive_landscape
from server_tests.publication_browser_helpers import export_figure, inspect_svg


@pytest.mark.parametrize("language", ["en", "zh"])
def test_model_validation_identity_ranges_exports_and_literal_source_names(language):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/metric-landscapes/controlled-model")
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
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
                    ("/api/jobs", "/api/batches", "/api/scientific/prepare")
                )
                else None
            ),
        )
        before = page.request.get(base + "/api/jobs").json()
        example = page.request.get(base + "/api/examples/admet.predict").json()
        identifier = example["pin"]["job_id"]
        original = page.request.get(base + f"/api/jobs/{identifier}").json()
        chemical = page.request.get(base + f"/api/jobs/{identifier}/result").json()
        job = copy.deepcopy(original)
        job["request"] = {
            "operation": "chemprop_train",
            "name": "Controlled model display · no training",
            "inputs": [
                {"role": "library", "source": {**chemical["source"], "record": 0, "conformer": 0}}
            ],
            "scientific_inputs": [{**chemical["source"], "record": 0, "conformer": 0}],
            "payload": {"kind": "chemprop", "mode": "train", "epochs": 5},
            "options": {"cpu": 2, "memory_mib": 4096},
        }
        points = [
            {"smiles": row["smiles"], "observed": observed, "predicted": predicted}
            for row, observed, predicted in zip(
                chemical["rows"], [-8.1, -7.3, -6.2], [-8.0, -7.8, -6.1], strict=True
            )
        ]
        report = {
            "operation": "chemprop_train",
            "schema_version": 1,
            "complete": True,
            "program": "chemprop",
            "version": "controlled-ui-contract",
            "candidates": [],
            "metrics": [],
            "artifact_sha256": {},
            "validation_points": points,
        }
        listing = copy.deepcopy(before)
        # The real platform's job-list contract is a bare list.
        assert isinstance(listing, list)
        listing = [value for value in listing if value["id"] != identifier] + [job]
        page.route("**/api/jobs", lambda route: route.fulfill(json=listing))
        page.route("**/api/jobs/" + identifier, lambda route: route.fulfill(json=job))
        page.route(
            "**/api/jobs/" + identifier + "/result", lambda route: route.fulfill(json=report)
        )
        page.goto(base + "/#task=" + identifier)
        panel = page.locator(".metric-scatter:visible").first
        expect(panel).to_be_visible(timeout=30000)
        chart = panel.get_by_role("application")
        expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
        assert chart.evaluate("el => el.data[0].x") == [-8.1, -7.3, -6.2]
        assert chart.evaluate("el => el.data[0].y") == [-8.0, -7.8, -6.1]
        assert chart.evaluate("el => el.layout.xaxis.range") == chart.evaluate(
            "el => el.layout.yaxis.range"
        )
        assert chart.evaluate("el => el.data[1].x") == chart.evaluate("el => el.data[1].y")
        exercise_plot_view(
            page, panel, language, chart.evaluate("el => el._fullLayout.xaxis.range")
        )
        svg = export_figure(
            page,
            panel.get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            language + "-controlled-model",
            language,
            "SVG",
        )
        inspect_svg(svg, "Observed" if language == "en" else "实验值")
        responsive_landscape(page, panel, evidence, language)
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not submissions
        (evidence / (language + "-scope.json")).write_text(
            json.dumps(
                {
                    "scientific_execution": False,
                    "native_model_accuracy_evidence": False,
                    "source": "Controlled API display contract; native ABL structures unchanged",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
