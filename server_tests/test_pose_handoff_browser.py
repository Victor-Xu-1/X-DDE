"""Actual native STAT6 minimization, exact pose choices, tabs, undo/redo and form handoff."""

import hashlib
import json
import os
import time
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


def read(base, path):
    with urlopen(base + path, timeout=15) as response:
        return response.read()


def wait_pose(page, language):
    control = page.locator(".pose-optimization")
    deadline = time.monotonic() + 180
    link = control.get_by_role(
        "link", name="下载当前 pose" if language == "zh" else "Download current pose", exact=True
    )
    while time.monotonic() < deadline:
        idle = control.get_by_role(
            "button", name="能量最小化" if language == "zh" else "Minimize energy", exact=True
        )
        if link.count() and link.is_visible() and idle.count() and idle.is_enabled():
            return control, link
        page.wait_for_timeout(300)
    raise AssertionError(
        "Native pose preparation did not finish: " + page.locator("main").inner_text()
    )


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_real_saved_current_pose_and_explicit_original_remain_exact_across_view_and_form_navigation(
    language, width
):
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    assert settings.chemistry_image == os.environ["WB_CHEMISTRY_IMAGE"]
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    raw = verified_input("study_protac") + verified_input("study_ligand")
    source = assets.save(f"STAT6-series-{language}.sdf", "ligand", raw)
    original = scientific.create(
        VersionInput(
            asset_id=source.id,
            kind="molecule",
            record=1,
            label=f"STAT6 warhead · original record 2 · {language}",
        ),
        uuid4(),
    )
    evidence = Path("outputs/pose-handoff") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(settings.state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        errors, requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                requests.append(request.post_data_json)
                if request.method == "POST" and request.url.endswith("/api/research/poses/minimize")
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role(
            "button", name=("分子: " if zh else "Molecule: ") + original.label, exact=True
        ).click()
        panel = page.get_by_role(
            "region", name="所选文件预览" if zh else "Selected file preview", exact=True
        )
        panel.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
        control, pose_link = wait_pose(page, language)
        first_url = pose_link.get_attribute("href")
        first_objects = scientific.list(200)
        first_object = next(
            value
            for value in first_objects
            if "/api/assets/" + str(value.reference.asset_id) == first_url
        )
        control.get_by_role(
            "button", name="能量最小化" if zh else "Minimize energy", exact=True
        ).click()
        expect(
            control.get_by_role("button", name="取消" if zh else "Cancel", exact=True)
        ).to_be_visible()
        _, pose_link = wait_pose(page, language)
        current_url = pose_link.get_attribute("href")
        assert current_url != first_url
        current = next(
            value
            for value in scientific.list(200)
            if "/api/assets/" + str(value.reference.asset_id) == current_url
        )
        assert current.reference.record == 0 and current.relation == "edited_from"
        with page.expect_download() as event:
            pose_link.click()
        data = Path(event.value.path()).read_bytes()
        assert hashlib.sha256(data).hexdigest() == current.reference.sha256
        page.screenshot(path=str(evidence / "current-pose.png"))
        panel.get_by_role("tab", name="二维结构" if zh else "2D structure", exact=True).click()
        panel.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
        expect(pose_link).to_have_attribute("href", current_url)
        assert len(requests) == 1

        def confirm_input(expected):
            page.get_by_role(
                "button", name="用作性质计算输入" if zh else "Use for properties", exact=True
            ).click()
            questionnaire = page.locator(".questionnaire:visible")
            questionnaire.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
            picker = questionnaire.locator(".asset-picker")
            selector = picker.locator("select")
            expect(selector).to_have_value(str(expected.reference.asset_id))
            expect(questionnaire).to_contain_text(
                f"第{expected.reference.record + 1}个分子记录"
                if zh
                else f"Molecule record {expected.reference.record + 1} is selected"
            )
            captured = []

            def capture_submission(route):
                captured.append(route.request.post_data_json)
                route.abort("failed")

            page.route("**/api/jobs", capture_submission)
            questionnaire.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
            questionnaire.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
            questionnaire.get_by_role(
                "button", name="计算性质" if zh else "Calculate properties", exact=True
            ).click()
            for _ in range(50):
                if captured:
                    break
                page.wait_for_timeout(100)
            assert len(captured) == 1
            assert captured[0]["scientific_inputs"] == [expected.reference.model_dump(mode="json")]
            assert captured[0]["ligand_files"] == [str(expected.reference.asset_id)]
            page.unroute("**/api/jobs", capture_submission)
            page.screenshot(
                path=str(evidence / ("input-" + str(expected.reference.record) + ".png"))
            )
            page.get_by_role(
                "button", name="← 返回研究资产" if zh else "← Back to assets", exact=True
            ).click()

        confirm_input(current)
        expect(pose_link).to_have_attribute("href", current_url)
        control.get_by_role(
            "button", name="回到上一个 pose" if zh else "Previous pose", exact=True
        ).click()
        expect(pose_link).to_have_attribute("href", first_url)
        confirm_input(first_object)
        control.get_by_role("button", name="下一个 pose" if zh else "Next pose", exact=True).click()
        expect(pose_link).to_have_attribute("href", current_url)
        page.get_by_role("radio", name="原始结果" if zh else "Original result", exact=True).check()
        confirm_input(original)
        assert len(requests) == 1 and not errors
        assert read(base, "/api/assets/" + source.id) == raw
        page.screenshot(path=str(evidence / "original-choice.png"))
        browser.close()
    assert assets.path(source).read_bytes() == raw
    (evidence / "receipt.json").write_text(
        json.dumps(
            {
                "language": language,
                "width": width,
                "original_version": str(original.id),
                "first_pose_version": str(first_object.id),
                "optimized_version": str(current.id),
                "current_sha256": current.reference.sha256,
                "original_sha256": original.reference.sha256,
                "explicit_minimizations": len(requests),
                "original_bytes_unchanged": True,
                "scope": "Native Chemistry and pose handoff only; "
                "no docking, ADMET, MD or FEP execution",
            },
            indent=2,
        )
    )
