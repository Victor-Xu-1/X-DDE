"""Actual same-run model result, immutable sequence versions and five-step Chromium flow."""

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def test_actual_antibody_domain_result_version_handoff_and_guided_task(tmp_path):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "antibody-numbering"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    result = json.loads((fixture / "result.json").read_text())
    source = assets.save(
        "actual-antibody.fasta", "sequences", (fixture / "input.fasta").read_bytes()
    )
    result["source"] = {
        "asset_id": source.id,
        "sha256": source.sha256,
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }
    for row in result["domains"]:
        row.pop("reference", None)
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "antibody_number",
            "name": "Actual native antibody result",
            "sequences": result["source"],
            "scientific_inputs": [result["source"]],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    snapshot = output.parent / "assets"
    snapshot.mkdir()
    shutil.copyfile(fixture / "input.fasta", snapshot / (source.id + source.suffix))
    for row in result["domains"]:
        if row["available"]:
            shutil.copyfile(fixture / row["artifact"], output / row["artifact"])
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    with (evidence / "antibody-browser.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(40):
                try:
                    with urlopen(base + "/api/health", timeout=2) as response:
                        assert json.load(response)["worker_ready"]
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise AssertionError("Antibody browser service did not become ready")
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base + "/#task=" + job.id)
                    results = page.locator(".discovery-results")
                    expect(
                        results.get_by_role("combobox", name="查看哪个输入/结构域？", exact=True)
                    ).to_be_visible()
                    report = page.request.get(base + f"/api/jobs/{job.id}/result").json()
                    light = next(
                        i for i, row in enumerate(report["domains"]) if row["source_id"] == "light"
                    )
                    ref = report["domains"][light]["reference"]
                    results.get_by_role(
                        "combobox", name="查看哪个输入/结构域？", exact=True
                    ).select_option(str(light))
                    expect(results.get_by_text("κ轻链型", exact=False)).to_be_visible()
                    expect(
                        results.get_by_role("button", name="用这个域预测结构", exact=True)
                    ).to_be_visible()
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        results.scroll_into_view_if_needed()
                        page.screenshot(
                            path=str(evidence / f"antibody-domains-{width}.png"), full_page=True
                        )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth"
                        )
                    results.get_by_role("button", name="用这个域预测结构", exact=True).click()
                    expect(page.locator(".questionnaire:visible")).to_be_visible()
                    assert (
                        len(page.request.get(base + "/api/jobs").json()) == 1 and ref["version_id"]
                    )
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.get_by_role("navigation", name="主导航").get_by_role(
                        "button", name="全部能力", exact=True
                    ).click()
                    page.get_by_role("button", name="抗体编号与 CDR 标注", exact=True).click()
                    scope = page.locator(".tool-center .questionnaire:visible")
                    scope.get_by_role("textbox", name="序列或 FASTA", exact=True).fill(
                        report["input_records"][0]["sequence"]
                    )
                    scope.get_by_role("button", name="保存序列版本", exact=True).click()
                    expect(
                        scope.get_by_role("status").filter(has_text="序列已保存")
                    ).to_be_visible()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("radio", name="串联的 scFv", exact=True).click()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("button", name="上一步", exact=True).click()
                    expect(
                        scope.get_by_role("radio", name="串联的 scFv", exact=True)
                    ).to_be_checked()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        scope.get_by_role("button", name="开始抗体标注", exact=True)
                    ).to_be_disabled()
                    assert len(page.request.get(base + "/api/jobs").json()) == 1
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        scope.scroll_into_view_if_needed()
                        page.screenshot(
                            path=str(evidence / f"antibody-review-{width}.png"), full_page=True
                        )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth"
                        )
                    assert not errors
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)
