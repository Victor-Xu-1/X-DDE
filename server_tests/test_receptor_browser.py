"""Actual same-run aligned structures through the built web UI; no new scientific execution."""

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


def test_real_receptor_ensemble_overlay_and_pocket_handoff(tmp_path):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "receptor-ensemble"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    result = json.loads((fixture / "result.json").read_text())
    for index, name in enumerate(("reference.pdb", "moving.pdb")):
        asset = assets.save(name, "structure", (fixture / name).read_bytes())
        result["inputs"][index]["structure"] = {
            "asset_id": asset.id,
            "sha256": asset.sha256,
            "record": 0,
            "conformer": 0,
            "version_id": None,
        }
        result["members"][index]["source"] = result["inputs"][index]
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "receptor_ensemble",
            "name": "实际原生受体对齐结果",
            "inputs": result["inputs"],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for row in result["members"]:
        shutil.copyfile(fixture / row["artifact"], output / row["artifact"])
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with (evidence / "receptor-browser.log").open("w") as log:
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
                raise AssertionError("Receptor browser service did not become ready")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                try:
                    page.goto(base + "/#task=" + job.id)
                    expect(
                        page.get_by_role("region", name="受体构象集合结果", exact=True)
                    ).to_be_visible()
                    page.locator(".receptor-results > details").nth(1).locator(
                        "summary"
                    ).first.click()
                    page.get_by_role("button", name="叠合预览此受体", exact=True).click()
                    expect(page.get_by_text("拖动旋转 · 滚轮缩放", exact=True)).to_be_visible(
                        timeout=30000
                    )
                    expect(
                        page.frame_locator('iframe[title="可交互分子结构"]').locator("canvas").first
                    ).to_be_visible(timeout=30000)
                    expect(
                        page.get_by_text(
                            "蓝色为参照受体，橙色为所选受体；完全重合时可见颜色会互相遮挡。",
                            exact=True,
                        )
                    ).to_be_visible()
                    page.screenshot(
                        path=str(evidence / "receptor-overlay-1440.png"), full_page=True
                    )
                    page.get_by_role("button", name="用此受体寻找口袋", exact=True).click()
                    selected = page.get_by_role(
                        "combobox", name="选择蛋白结构 · 复用研究资产", exact=True
                    )
                    expect(selected).not_to_have_value("")
                    page.get_by_role("button", name="下一步", exact=True).click()
                    expect(
                        page.get_by_role("combobox", name="这份结构来自哪里？", exact=True)
                    ).to_have_value("")
                    for width in (1440, 390):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        )
                        page.screenshot(
                            path=str(evidence / f"receptor-pocket-handoff-{width}.png"),
                            full_page=True,
                        )
                    assert len(page.request.get(base + "/api/jobs").json()) == 1 and not errors
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=10)
