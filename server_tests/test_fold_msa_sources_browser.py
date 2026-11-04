"""Compiled bilingual fold form and real asset validation; controlled POST, no model."""

import json
import os
from dataclasses import replace
from pathlib import Path

import pytest
from antibody_cdr_case import numbering_case
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.examples.stat6.antibody_cdr_inputs import replayed_antibody_cdr
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform


def msa_case(settings):
    scientific, records, *_ = numbering_case(settings)
    prepared = prepare_stat6("fold", scientific, records=records)
    original = prepared.request["payload"]
    sequences = {
        **original["options"]["target_chains"],
        **original["candidates"][0]["chains"],
    }
    alignments = {
        chain: scientific.assets.save(
            chain + "-protocol.a3m", "msa", f">query\n{sequence}\n".encode()
        )
        for chain, sequence in sequences.items()
    }
    return scientific, alignments


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_msa_form_retains_exact_numbering_then_detaches_edited_sequence(language, width):
    initial = Settings.from_env()
    assert initial.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    settings = replace(initial, state_dir=initial.state_dir / ("msa-source-" + language))
    scientific, alignments = msa_case(settings)
    evidence = Path("outputs/antibody-cdr") / ("msa-source-" + language)
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    submissions, errors = [], []

    def ready(route):
        value = route.fetch().json()
        value["availability"]["configuration_present"] = True
        route.fulfill(status=200, content_type="application/json", body=json.dumps(value))

    def capture(route):
        if route.request.method != "POST":
            route.continue_()
            return
        submissions.append(route.request.post_data_json)
        route.fulfill(
            status=409,
            content_type="application/json",
            body=json.dumps({"detail": "Protocol capture only; no model was submitted."}),
        )

    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.route("**/api/capabilities/fold", ready)
        page.route("**/api/jobs", capture)
        page.goto(base + "/#view=new&tool=fold")
        before = page.request.get(base + "/api/jobs").json()
        with page.expect_response(lambda r: "/api/examples/fold/prepare" in r.url) as response:
            page.get_by_role(
                "button", name="使用此模板" if zh else "Use this template", exact=True
            ).click()
        prepared = response.value.json()
        reference = prepared["objects"]["antibody_cdr_inputs"]["reference"]
        original = json.loads(json.dumps(prepared["request"]["payload"]))
        payload = json.loads(json.dumps(original))
        for chains in (payload["options"]["target_chains"], payload["candidates"][0]["chains"]):
            for chain, sequence in list(chains.items()):
                chains[chain] = {
                    "sequence": sequence,
                    "unpairedMsaPath": "asset:" + alignments[chain].id,
                }
        page.get_by_role("button", name="专家模式" if zh else "Expert mode", exact=True).click()
        editor = page.get_by_role(
            "textbox",
            name="完整原生科学参数" if zh else "Full native scientific parameters",
            exact=True,
        )
        next_step = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        for edited in (False, True):
            if edited:
                for _ in range(3):
                    page.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
                heavy = payload["candidates"][0]["chains"]["A"]
                heavy["sequence"] += "A"
                heavy.pop("unpairedMsaPath")  # An edited sequence cannot use its old query.
            editor.fill(json.dumps(payload))
            expect(next_step).to_be_enabled(timeout=30000)
            next_step.click()
            next_step.click()
            page.get_by_role(
                "checkbox", name="允许向配置" if zh else "Allow sending", exact=False
            ).check()
            next_step.click()
            expect(
                page.get_by_role("table", name="目标蛋白" if zh else "Target protein", exact=True)
            ).to_contain_text("218")
            label = "预览任务" if zh else "Preview job"
            opener = page.get_by_role("button", name=label, exact=True)
            with page.expect_response(
                lambda r: r.url.endswith("/api/harness/fold/preview")
            ) as preview:
                opener.click()
            assert preview.value.ok
            dialog = page.get_by_role("dialog", name=label, exact=True)
            expect(
                dialog.get_by_text(payload["candidates"][0]["candidate_id"], exact=True)
            ).to_be_visible()
            target = dialog.get_by_role("region", name="靶标" if zh else "Target", exact=True)
            target.locator("summary").first.click()
            expect(target.get_by_role("link", name="protocol.a3m", exact=False)).to_have_count(1)
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
            assert len(submissions) == int(edited)
            submit = dialog.get_by_role(
                "button", name="提交任务" if zh else "Submit job", exact=True
            )
            expect(submit).to_be_enabled(timeout=30000)
            page.screenshot(path=evidence / ("edited.png" if edited else "review.png"))
            dialog.get_by_role(
                "button", name="提交内容" if zh else "Request JSON", exact=True
            ).click()
            shown = json.loads(
                dialog.get_by_label(
                    "X-DDE 提交请求" if zh else "X-DDE submission request"
                ).inner_text()
            )
            with page.expect_response(
                lambda r: r.request.method == "POST" and r.url.endswith("/api/jobs")
            ):
                submit.click()
            captured = submissions[-1]
            assert captured == shown == preview.value.request.post_data_json
            assert captured["payload"] == payload
            assert (reference in captured["scientific_inputs"]) is not edited
            scientific.assets.validate_bindings(TASK_ADAPTER.validate_python(captured))
            annotation = replayed_antibody_cdr(scientific, captured)
            assert (annotation is None) is edited
            expect(submit).to_be_enabled()
            page.keyboard.press("Escape")
            expect(opener).to_be_focused()
            expect(dialog).to_have_count(0)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert len(submissions) == 2 and not errors
        assert before == page.request.get(base + "/api/jobs").json()
        assert prepared["request"]["payload"] == original
        (evidence / "verified.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "captured_requests": submissions,
                    "controlled_readiness_and_rejected_submission": True,
                    "native_models_run": 0,
                    "new_worker_jobs": 0,
                    "real_backend_source_and_alignment_validation": True,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        browser.close()
