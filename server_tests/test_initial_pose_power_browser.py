"""The real molecule preview exposes its default-off engine before creating a task."""

from pathlib import Path
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize(
    "language,width,failed",
    [("en", 1440, False), ("zh", 390, False), ("en", 1280, True), ("zh", 1440, True)],
)
def test_unprepared_ligand_shows_local_switch_without_queuing(tmp_path, language, width, failed):
    raw = Path("tests/fixtures/reference_import/CHEMBL376085.sdf").read_bytes()
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    asset = assets.save("CHEMBL376085.sdf", "ligand", raw)
    label = "CHEMBL376085 · original 2D"
    ScientificStore(store, assets).create(
        VersionInput(asset_id=asset.id, kind="molecule", label=label), uuid4()
    )
    zh = language == "zh"
    with platform(state, tmp_path / "server.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 850})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role(
            "button", name=("分子: " if zh else "Molecule: ") + label, exact=True
        ).click()
        preview = page.get_by_role(
            "region", name="所选文件预览" if zh else "Selected file preview"
        )
        if failed:
            page.route(
                "**/api/research/poses/initial",
                lambda route: route.fulfill(
                    status=503, json={"detail": "Initial conformer service failed."}
                ),
                times=1,
            )
        with page.expect_response(
            lambda response: response.url.endswith("/api/research/poses/initial")
            and response.request.method == "POST"
        ) as initial:
            preview.get_by_role("tab", name="三维结构" if zh else "3D structure").click()
        assert initial.value.status == (503 if failed else 200)
        if not failed:
            assert initial.value.json() == {"state": "backend_off"}
        panel = preview.locator(".initial-pose-status")
        switch = panel.locator('[data-engine="chemistry"]').get_by_role("switch")
        expect(switch).to_be_visible()
        expect(switch).not_to_be_checked()
        expect(switch).to_be_disabled()  # Isolated platform has no native engine installed.
        action = ("重试" if zh else "Retry") if failed else (
            "生成三维构象" if zh else "Prepare 3D conformer"
        )
        expect(panel.get_by_role("button", name=action, exact=True)).to_be_disabled()
        assert panel.get_by_role("combobox").count() == int(failed)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert page.request.get(base + "/api/jobs").json() == before
        assert page.request.get(base + f"/api/assets/{asset.id}").body() == raw
        browser.close()
