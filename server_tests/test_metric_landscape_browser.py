"""Frozen native molecular/sequence cases; no model calls, training or new tasks."""

import hashlib
import json
import math
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.landscape_browser_helpers import choose_native_point, responsive_landscape
from server_tests.publication_browser_helpers import export_figure, inspect_svg

CAPABILITIES = ["properties", "admet.predict", "chemistry.states", "mpnn", "esm"]


def expected_pairs(capability, report, job, axes):
    if capability == "properties":
        return [(row[axes[0]], row[axes[1]]) for row in report["molecules"] if row["available"]]
    if capability == "admet.predict":
        return [
            (row["predictions"].get(axes[0]), row["predictions"].get(axes[1]))
            for row in report["rows"]
            if row["status"] == "predicted"
        ]
    if capability == "chemistry.states":
        # The viewer opens the first native state; each plotted point is one exact saved conformer.
        return [
            (row["native_conformer"] + 1, row["energy"])
            for row in report["conformers"]
            if row["state_index"] == 0
        ]
    if capability == "esm":
        return [
            (len(sequence), score)
            for sequence, score in zip(
                job["request"]["payload"]["sequences"], report["result"]["scores"], strict=True
            )
        ]
    candidates = report["result"]["candidates"]
    chain = axes[1].split(":")[1]
    return [
        (index + 1, value["metadata"]["soluble_mpnn_scores"][chain])
        for index, value in enumerate(candidates)
    ]


@pytest.mark.parametrize("capability", CAPABILITIES)
@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_landscape_preserves_values_links_records_and_exports(capability, language):
    base = os.environ["WB_BROWSER_URL"]
    evidence = Path("outputs/metric-landscapes") / capability
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
        example = page.request.get(base + "/api/examples/" + capability).json()
        assert example["computed_result_available"] and example["pin"]
        identifier = example["pin"]["job_id"]
        report = page.request.get(base + f"/api/jobs/{identifier}/result").json()
        job = page.request.get(base + f"/api/jobs/{identifier}").json()
        for name, digest in example["pin"]["artifact_sha256"].items():
            file = page.request.get(
                base + f"/api/jobs/{identifier}/download", params={"name": name}
            )
            assert file.ok and hashlib.sha256(file.body()).hexdigest() == digest
        page.goto(base + "/#task=" + identifier)
        if capability == "admet.predict":
            page.get_by_role(
                "tab", name="Property landscape" if language == "en" else "性质分布", exact=True
            ).click()
        panel = page.locator(".metric-scatter:visible").first
        expect(panel).to_be_visible(timeout=30000)
        chart = panel.get_by_role("application")
        expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
        labels = ("X axis", "Y axis") if language == "en" else ("横轴", "纵轴")
        axes = [panel.get_by_role("combobox", name=name).input_value() for name in labels]
        pairs = [
            (x, y)
            for x, y in expected_pairs(capability, report, job, axes)
            if x is not None and y is not None and math.isfinite(x) and math.isfinite(y)
        ]
        assert len(pairs) >= 2
        native = chart.evaluate("el => ({x:el.data[0].x,y:el.data[0].y})")
        assert native["x"] == [pair[0] for pair in pairs]
        assert native["y"] == [pair[1] for pair in pairs]
        choice = panel.get_by_role(
            "combobox", name="Inspect record" if language == "en" else "查看记录"
        )
        indices = choice.locator("option").evaluate_all(
            "els => els.map(el => el.value).filter(Boolean)"
        )
        expect(choice).not_to_have_value(indices[-1])
        choose_native_point(page, chart, len(pairs) - 1)
        expect(choice).to_have_value(indices[-1])
        choice.select_option(indices[0])
        expect(choice).to_have_value(indices[0])
        expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
        panel.get_by_role(
            "combobox", name="Chart interaction" if language == "en" else "图表操作"
        ).select_option("pan")
        expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
        svg = export_figure(
            page,
            panel.get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            language + "-native-landscape",
            language,
            "SVG",
        )
        inspect_svg(svg, chart.evaluate("el => el.layout.xaxis.title.text"))
        responsive_landscape(page, panel, evidence, language)
        assert page.request.get(base + "/api/jobs").json() == before
        assert not errors and not submissions
        (evidence / (language + "-identity.json")).write_text(
            json.dumps(
                {
                    "job_id": identifier,
                    "capability": capability,
                    "native_pairs": pairs,
                    "scientific_recomputation": False,
                    "source_artifacts_verified": True,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
