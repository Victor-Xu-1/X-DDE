"""Chromium consumes actual same-run native library outputs and exact record handoff."""

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


def test_actual_library_result_exact_record_handoff_and_questionnaire(tmp_path):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "library-screen"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    result = json.loads((fixture / "result.json").read_text())
    library = assets.save("actual-library.sdf", "ligand", (fixture / "input.sdf").read_bytes())
    result["library"] = {"asset_id": library.id, "sha256": library.sha256}
    for row in result["rows"]:
        row.pop("reference", None)
    request = TASK_ADAPTER.validate_python(
        {"operation": "library_screen", "library": result["library"], "options": result["options"]}
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    shutil.copyfile(fixture / result["artifact"], output / result["artifact"])
    if result.get("report_artifact"):
        shutil.copyfile(fixture / result["report_artifact"], output / result["report_artifact"])
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
    with (evidence / "library-browser.log").open("w") as log:
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
                raise AssertionError("Library browser service did not become ready")
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base + "/#task=" + job.id)
                    results = page.locator(".discovery-results")
                    expect(
                        results.get_by_role("button", name="准备分子", exact=True)
                    ).to_be_visible()
                    report = page.request.get(base + f"/api/jobs/{job.id}/result").json()
                    ref = report["rows"][0]["reference"]
                    assert (
                        ref["record"] == 0
                        and ref["version_id"]
                        and ref["sha256"] == result["sha256"]
                    )
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        results.scroll_into_view_if_needed()
                        page.screenshot(
                            path=str(evidence / f"library-results-{width}.png"), full_page=True
                        )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth<=window.innerWidth"
                        )
                    results.get_by_role("checkbox", name="只看选中分子", exact=True).uncheck()
                    expect(
                        results.get_by_text("重复结构，保留原始第 1 条", exact=True)
                    ).to_be_visible()
                    results.get_by_role("button", name="准备分子", exact=True).click()
                    scope = page.locator(".questionnaire:visible")
                    picker = scope.get_by_role(
                        "combobox", name="选择 SDF 分子版本 · 复用研究资产", exact=True
                    )
                    expect(picker).to_have_value(ref["version_id"])
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("button", name="上一步", exact=True).click()
                    expect(picker).to_have_value(ref["version_id"])
                    assert len(page.request.get(base + "/api/jobs").json()) == 1
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.get_by_role("navigation", name="主导航").get_by_role(
                        "button", name="全部能力", exact=True
                    ).click()
                    page.get_by_role("button", name="分子库与早期筛选", exact=True).click()
                    scope = page.locator(".tool-center .questionnaire:visible")
                    library_picker = scope.get_by_role(
                        "combobox", name="SDF 分子库文件", exact=True
                    )
                    library_picker.focus()
                    expect(library_picker.locator(f'option[value="{library.id}"]')).to_have_count(1)
                    library_picker.select_option(library.id)
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("radio", name="挑多样性代表", exact=True).click()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role(
                        "combobox", name="最多保留多少个？", exact=True
                    ).select_option("10")
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        scope.get_by_role("button", name="开始分子库筛选", exact=True)
                    ).to_be_disabled()
                    assert len(page.request.get(base + "/api/jobs").json()) == 1
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        scope.scroll_into_view_if_needed()
                        page.screenshot(
                            path=str(evidence / f"library-review-{width}.png"), full_page=True
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
