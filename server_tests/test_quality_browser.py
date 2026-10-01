"""Same-run native quality, exact versions, 3D preview and questionnaire navigation."""

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


def test_actual_quality_result_preview_and_simple_task_steps(tmp_path):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.contracts import VersionInput
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.store import Store

    fixture = Path(os.environ["WB_CORE_FIXTURE"]) / "pose-quality"
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    scientific = ScientificStore(store, assets)
    report = json.loads((fixture / "result.json").read_text())
    for role, kind, filename in (
        ("molecule", "ligand", "molecule.sdf"),
        ("protein", "structure", "protein.pdb"),
    ):
        asset = assets.save("Quality source " + filename, kind, (fixture / filename).read_bytes())
        value = VersionInput(
            asset_id=asset.id,
            kind="molecule" if role == "molecule" else "structure",
            label="Quality source " + role,
            record=report["inputs"][role]["record"],
        )
        version = scientific.create_many([(value, "fixture-" + role)])[0]
        report["inputs"][role] = version.reference.model_dump(mode="json")
    report["inputs"]["reference"] = report["inputs"]["molecule"]
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "pose_quality",
            "name": "Actual native pose quality",
            "options": report["options"],
            **report["inputs"],
            "coordinate_basis": "user_confirmed",
            "scientific_inputs": list(report["inputs"].values()),
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    store.claim(expected_id=job.id)
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    snapshot = output.parent / "assets"
    snapshot.mkdir()
    for role in ("molecule", "protein"):
        ref = report["inputs"][role]
        suffix = ".sdf" if role == "molecule" else ".pdb"
        shutil.copyfile(fixture / (role + suffix), snapshot / (ref["asset_id"] + suffix))
    for name in report["previews_sha256"]:
        shutil.copyfile(fixture / name, output / name)
    (output / "result.json").write_text(json.dumps(report))
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
    with (evidence / "quality-browser.log").open("w") as log:
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
                        if json.load(response)["worker_ready"]:
                            break
                except OSError:
                    pass
                time.sleep(0.2)
            else:
                raise AssertionError("Quality browser platform did not start")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.goto(base + "/#task=" + job.id)
                expect(
                    page.get_by_role("region", name="构象与姿势质控结果", exact=True)
                ).to_be_visible()
                expect(
                    page.get_by_role("cell", name="与参考姿势偏差 ≤ 2 Å", exact=True)
                ).to_be_visible()
                expect(page.locator("iframe").first).to_be_visible()
                for width in (1440, 390):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    page.screenshot(
                        path=str(evidence / f"quality-results-{width}.png"), full_page=True
                    )
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.get_by_role("navigation", name="主导航").get_by_role(
                    "button", name="全部能力", exact=True
                ).click()
                page.get_by_role("button", name="构象与姿势质控", exact=True).click()
                panel = page.locator(".questionnaire:visible")
                panel.get_by_role(
                    "combobox", name="检查哪个分子版本？ · 复用研究资产", exact=True
                ).select_option(report["inputs"]["molecule"]["version_id"])
                page.get_by_role("button", name="下一步", exact=True).click()
                page.get_by_role("radio", name="蛋白内的结合姿势", exact=False).click()
                page.get_by_role("button", name="下一步", exact=True).click()
                expect(page.get_by_role("button", name="下一步", exact=True)).to_be_disabled()
                panel.get_by_role(
                    "combobox", name="对应的 PDB 蛋白版本 · 复用研究资产", exact=True
                ).select_option(report["inputs"]["protein"]["version_id"])
                page.get_by_role(
                    "checkbox", name="这些分子姿势与所选蛋白处于同一坐标系", exact=True
                ).check()
                page.get_by_role("button", name="下一步", exact=True).click()
                expect(page.get_by_role("button", name="开始质控", exact=True)).to_be_disabled()
                assert len(page.request.get(base + "/api/jobs").json()) == 1
                page.get_by_role("button", name="上一步", exact=True).click()
                expect(
                    page.get_by_role(
                        "checkbox", name="这些分子姿势与所选蛋白处于同一坐标系", exact=True
                    )
                ).to_be_checked()
                page.get_by_role("button", name="下一步", exact=True).click()
                for width in (1440, 390):
                    page.set_viewport_size({"width": width, "height": 1000})
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= window.innerWidth + 1"
                    )
                    page.screenshot(
                        path=str(evidence / f"quality-review-{width}.png"), full_page=True
                    )
                browser.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
