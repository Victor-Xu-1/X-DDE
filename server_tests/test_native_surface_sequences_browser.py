"""Actual frozen native sequence results in hosted Chromium; never start science."""

import csv
import io
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

EVIDENCE = Path("server_tests/evidence/native-surface-sequences")
CASES = {
    "esm2": ("c689b556-3e00-4f94-a578-c631ef7717e4", 4, 1),
    "mpnn": ("e9ccf58d-d7c9-41ec-ae8b-f952a4b9fd3d", 8, 4),
}


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("capability", list(CASES))
def test_native_sequences_select_export_and_fit_without_submitting_jobs(language, capability):
    identifier, count, chosen = CASES[capability]
    zh = language == "zh"
    base = os.environ["WB_BROWSER_URL"]
    destination = EVIDENCE / (capability + "-" + language)
    destination.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url)
            if request.method == "POST"
            and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
            else None,
        )
        page.goto(base + "/#view=results&module=biologics&task=" + identifier)
        before = page.request.get(base + "/api/jobs").json()
        job = page.request.get(base + "/api/jobs/" + identifier).json()
        response = page.request.get(base + f"/api/jobs/{identifier}/result")
        assert response.ok
        native = response.json()["result"]
        candidates = (native["result"] if capability == "esm2" else native)["candidates"]
        assert len(candidates) == len({row["sequence"] for row in candidates}) == count
        summary = page.get_by_role("region", name="序列多样性" if zh else "Sequence diversity", exact=True)
        expect(summary).to_be_visible()
        values = summary.locator("strong").all_text_contents()
        assert values == [str(count), str(count), str(count)]
        table = page.get_by_role("table", name="序列候选" if zh else "Sequence candidates", exact=True)
        if capability == "mpnn":
            label = "MPNN 设计分数 ↓ · A" if zh else "MPNN design score ↓ · A"
            expect(table.get_by_role("button", name=label, exact=True)).to_be_visible()
            name = ("候选 " if zh else "Candidate ") + str(chosen + 1)
        else:
            name = candidates[chosen]["candidate_id"]
        table.get_by_role("button", name=name, exact=True).click()
        panel = page.locator(".sequence-candidate-results")
        expect(panel.get_by_role("heading", name=name, exact=True)).to_be_visible()
        sequence_view = panel.get_by_role("region", name="候选序列 · A" if zh else "Candidate sequence · A", exact=True)
        with page.expect_download() as event:
            sequence_view.get_by_role("button", name="下载此序列 FASTA" if zh else "Download this sequence FASTA", exact=True).click()
        fasta = destination / "candidate.fasta"
        event.value.save_as(fasta)
        lines = fasta.read_text().splitlines()
        assert lines[0] == f">{identifier}:sample-{chosen + 1}:A"
        assert "".join(lines[1:]) == candidates[chosen]["sequence"]
        assert event.value.suggested_filename == f"{identifier}_sample-{chosen + 1}_A.fasta"
        with page.expect_download() as event:
            panel.get_by_role("button", name="导出筛选结果" if zh else "Export filtered rows", exact=True).click()
        metrics = destination / "native-metrics.csv"
        event.value.save_as(metrics)
        exported = list(csv.DictReader(io.StringIO(metrics.read_text(encoding="utf-8-sig"))))
        assert len(exported) == count
        score_key = ("MPNN 设计分数 ↓ · A" if zh else "MPNN design score ↓ · A") if capability == "mpnn" else "ESM2 LLR"
        for row, candidate in zip(exported, candidates, strict=True):
            metadata = candidate["metadata"]
            score = metadata["soluble_mpnn_scores"]["A"] if capability == "mpnn" else metadata["esm2_llr"]
            assert float(row[score_key]) == score
        for width in (1440, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            summary.scroll_into_view_if_needed()
            page.wait_for_function("() => document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=destination / f"native-result-{width}.png")
        assert not errors, errors
        assert not submissions, submissions
        assert page.request.get(base + "/api/jobs").json() == before
        assert page.request.get(base + "/api/jobs/" + identifier).json() == job
        (destination / "acceptance.json").write_text(json.dumps({
            "job_id": identifier, "language": language, "native_samples": count,
            "distinct_sequences": count, "selected_sample": chosen + 1,
            "exact_fasta_and_scores": True, "new_scientific_jobs": 0,
            "scope": "hosted_chromium_frozen_case_inspection_not_owner_frontend_submission",
        }, indent=2))
        browser.close()
