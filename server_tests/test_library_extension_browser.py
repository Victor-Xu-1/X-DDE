"""Chromium reads the same-run therapeutic container outputs and submits no scientific job."""

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


def import_fixture(state, mode):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path("server_tests/evidence/library-container") / mode
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    library = assets.save("ABL-inhibitors.sdf", "ligand", (fixture / "input.sdf").read_bytes())
    result = json.loads((fixture / "result.json").read_text())
    result["library"] = {"asset_id": library.id, "sha256": library.sha256}
    for row in result["rows"]:
        row.pop("reference", None)
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "library_screen",
            "name": f"ABL inhibitor {mode} review",
            "library": result["library"],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for name in (result["artifact"], result["report_artifact"]):
        shutil.copyfile(fixture / name, output / name)
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    return job.id


def test_therapeutic_library_results_and_new_guided_choices(tmp_path):
    state = tmp_path / "state"
    identifiers = {mode: import_fixture(state, mode) for mode in ("alerts", "scaffold")}
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    evidence = Path("server_tests/evidence")
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    with (evidence / "library-extension-browser.log").open("w") as log:
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
                raise AssertionError("The isolated browser service did not become ready.")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors, submissions = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on(
                    "request",
                    lambda request: (
                        submissions.append(request.url)
                        if request.method == "POST" and request.url.endswith("/api/jobs")
                        else None
                    ),
                )
                try:
                    for mode, identifier in identifiers.items():
                        page.goto(base + "/#task=" + identifier)
                        results = page.locator(".discovery-results")
                        expect(results).to_be_visible()
                        expect(
                            results.get_by_role("link", name="下载筛选表格", exact=True)
                        ).to_be_visible()
                        report = page.request.get(base + f"/api/jobs/{identifier}/result").json()
                        assert all(row["reference"]["version_id"] for row in report["rows"])
                        if mode == "alerts":
                            expect(results.get_by_role("status")).to_contain_text(
                                "完成风险检查 3 / 3"
                            )
                        else:
                            expect(
                                results.get_by_role("columnheader", name="骨架组", exact=True)
                            ).to_be_visible()
                            expect(results.get_by_text("骨架 1", exact=False)).to_be_visible()
                        for width in (1440, 390):
                            page.set_viewport_size({"width": width, "height": 1000})
                            results.scroll_into_view_if_needed()
                            page.screenshot(
                                path=str(evidence / f"library-{mode}-results-{width}.png"),
                                full_page=True,
                            )
                            assert page.evaluate(
                                "document.documentElement.scrollWidth <= window.innerWidth"
                            )
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.get_by_role("navigation", name="主导航").get_by_role(
                        "button", name="性质与安全性", exact=True
                    ).click()
                    page.get_by_role("combobox", name="研究任务", exact=True).select_option(
                        "chemistry.screen"
                    )
                    scope = page.locator(".tool-center .questionnaire:visible")
                    scope.get_by_label("上传 SDF 分子库文件", exact=True).set_input_files(
                        "server_tests/evidence/library-inputs/abl-inhibitors.sdf"
                    )
                    expect(scope.get_by_role("button", name="下一步", exact=True)).to_be_enabled()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role("radio", name="检查结构风险", exact=True).click()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        scope.get_by_role("combobox", name="结构风险如何处理？", exact=True)
                    ).to_have_value("warn")
                    scope.get_by_role("button", name="上一步", exact=True).click()
                    scope.get_by_role("radio", name="按骨架挑代表", exact=True).click()
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    scope.get_by_role(
                        "combobox", name="每个骨架保留几个？", exact=True
                    ).select_option("2")
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        scope.scroll_into_view_if_needed()
                        page.screenshot(
                            path=str(evidence / f"library-scaffold-settings-{width}.png"),
                            full_page=True,
                        )
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth"
                        )
                    scope.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        scope.get_by_role("button", name="开始分子库筛选", exact=True)
                    ).to_be_disabled()
                    assert not errors and not submissions
                    assert len(page.request.get(base + "/api/jobs").json()) == 2
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)
