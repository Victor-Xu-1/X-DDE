"""Real retained pose/run selection and an explicit, nonexecuting quality handoff."""

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_POSE_CLUSTER"), reason="Select the native pose browser gate."
)


def inspect_quality_handoff(page, result, pose, receptor, evidence, zh):
    result.get_by_role(
        "button", name="检查此姿势质量" if zh else "Check pose quality", exact=True
    ).click()
    form = page.locator(".questionnaire:visible")
    for _ in range(2):
        form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    confirm = form.get_by_role(
        "checkbox",
        name="这些分子姿势与所选蛋白处于同一坐标系"
        if zh
        else "These poses share the selected protein coordinate frame",
        exact=True,
    )
    expect(confirm).not_to_be_checked()
    expect(form.get_by_role("button", name="下一步" if zh else "Next", exact=True)).to_be_disabled()
    confirm.check()
    form.get_by_role("button", name="下一步" if zh else "Next", exact=True).click()
    expect(form.locator(f'a[href="/api/assets/{pose["reference"]["asset_id"]}"]')).to_be_visible(
        timeout=30000
    )
    expect(form.locator(f'a[href="/api/assets/{receptor["asset_id"]}"]')).to_be_visible(
        timeout=30000
    )
    page.screenshot(path=evidence / "quality-input-review.png", full_page=True)
    page.get_by_role("button", name="← 返回结果" if zh else "← Back to results", exact=True).click()
    expect(
        result.get_by_role("link", name="下载此姿势" if zh else "Download this pose", exact=True)
    ).to_have_attribute("href", "/api/assets/" + pose["reference"]["asset_id"])


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_retained_run_opens_results_and_hands_selected_pose_to_quality_without_execution(
    language, width, monkeypatch
):
    root = Path(os.environ["WB_POSE_CLUSTER"])
    assert root.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    accepted = json.loads((root / "acceptance.json").read_text())
    monkeypatch.setenv("WB_CHEMISTRY_IMAGE", accepted["chemistry_image"])
    evidence = Path("outputs/pose-quality-handoff") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with platform(root / "state", evidence / "platform.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        if zh:
            page.add_init_script("localStorage.setItem('opendde-workbench.language','zh')")
        errors, scientific_posts = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "request",
            lambda r: (
                scientific_posts.append(r.url)
                if r.method == "POST" and urlsplit(r.url).path == "/api/jobs"
                else None
            ),
        )
        try:
            native = page.request.get(
                base + "/api/research/pose-ensembles/" + accepted["pose_set_id"]
            ).json()
            choices = [
                (i, p)
                for i, o in enumerate(native["outcomes"])
                for p in o["poses"]
                if p["reference"]
            ]
            assert len(choices) >= 2
            index, pose = choices[1]
            receptor = native["outcomes"][index]["combination"]["receptor"]
            page.goto(base)
            open_navigation(page, language).get_by_role(
                "button", name="口袋与对接" if zh else "Pockets and docking", exact=True
            ).click()
            page.get_by_role(
                "combobox", name="研究任务" if zh else "Research task", exact=True
            ).select_option("pose_exploration")
            page.get_by_text(
                "历史探索计划" if zh else "Historical exploration plans", exact=True
            ).click()
            page.get_by_role(
                "combobox", name="选择历史计划" if zh else "Choose a historical plan", exact=True
            ).select_option(accepted["exploration_id"])
            result = page.get_by_role(
                "region",
                name="多假设姿势集合" if zh else "Multi-hypothesis pose ensemble",
                exact=True,
            )
            expect(result).to_have_attribute("data-pose-set-id", native["id"])
            expect(page.locator(".pose-run-settings")).not_to_have_attribute("open", "")
            result.get_by_role(
                "combobox", name="查看哪个组合？" if zh else "Which combination?", exact=True
            ).select_option(str(index))
            result.get_by_role(
                "button",
                name=("姿势 " if zh else "Pose ") + str(pose["evidence"]["record"] + 1),
                exact=True,
            ).click()
            link = result.get_by_role(
                "link", name="下载此姿势" if zh else "Download this pose", exact=True
            )
            expect(link).to_have_attribute("href", "/api/assets/" + pose["reference"]["asset_id"])
            with page.expect_download() as downloaded:
                link.click()
            assert (
                hashlib.sha256(Path(downloaded.value.path()).read_bytes()).hexdigest()
                == pose["reference"]["sha256"]
            )
            expect(
                result.get_by_role(
                    "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
                )
            ).to_be_enabled(timeout=30000)
            left = result.locator(".structure-workbench-view").bounding_box()
            right = result.locator(".structure-workbench-details").bounding_box()
            assert left and right
            if width > 1000:
                assert left["x"] < right["x"] and left["width"] > right["width"]
            else:
                assert left["y"] < right["y"]
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
            page.screenshot(path=evidence / "selected-native-pose.png", full_page=True)
            inspect_quality_handoff(page, result, pose, receptor, evidence, zh)
            assert scientific_posts == [] and errors == []
            (evidence / "acceptance.json").write_text(
                json.dumps(
                    dict(
                        language=language,
                        width=width,
                        pose_set_id=native["id"],
                        pose=pose["reference"],
                        paired_receptor=receptor,
                        source_download_sha256=pose["reference"]["sha256"],
                        explicit_frame_confirmation_required=True,
                        new_scientific_jobs=0,
                        retained_fixture_target="BRD4/JQ1; UI evidence only",
                    ),
                    indent=2,
                )
            )
        except Exception:
            page.screenshot(path=evidence / "failure.png", full_page=True)
            (evidence / "failure.html").write_text(page.content())
            raise
        finally:
            browser.close()
