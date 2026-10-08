"""Inspect actual BRD4 native results and downstream inputs, without new inference."""

import hashlib
import json
import os

from ensemble_browser_helpers import (
    EVIDENCE,
    capture,
    download,
    open_result,
    paired_layout,
    preserve_assets,
)
from playwright.sync_api import expect, sync_playwright


def test_native_pose_result_selection_downloads_and_handoff():
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, submissions, geometries = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        try:
            open_result(page, "多受体与状态姿势探索")
            result = page.get_by_role("region", name="多假设姿势集合", exact=True)
            expect(result).to_be_visible()
            # Read the same pinned native set the real example page displays.
            example = page.request.get(base + "/api/examples/pose_exploration").json()
            record_id = example["record_pin"]["record_id"]
            sets = page.request.get(
                base + "/api/research/pose-ensembles?exploration_id=" + record_id
            ).json()
            assert len(sets) == 1
            saved = sets[0]
            index = next(
                i
                for i, outcome in enumerate(saved["outcomes"])
                if any(pose["reference"] for pose in outcome["poses"])
            )
            choices = result.get_by_role("combobox", name="查看哪个组合？", exact=True)
            choices.select_option(str(index))
            outcome = saved["outcomes"][index]
            poses = [pose for pose in outcome["poses"] if pose["reference"]]
            preserved = preserve_assets(
                page, [outcome["combination"]["receptor"], *[pose["reference"] for pose in poses]]
            )
            for width in (1440, 390):
                geometries.append(paired_layout(page, width, ".pose-detail"))
                selected = poses[-1]
                button = result.get_by_role(
                    "button", name="姿势 " + str(selected["evidence"]["record"] + 1), exact=True
                )
                button.focus()
                button.press("Enter")
                expect(button).to_have_attribute("aria-pressed", "true")
                expect(
                    result.get_by_role("button", name="生成三维视图图片", exact=True)
                ).to_be_enabled(timeout=30000)
                link = result.get_by_role("link", name="下载此姿势", exact=True)
                expect(link).to_have_attribute(
                    "href", "/api/assets/" + selected["reference"]["asset_id"]
                )
                capture(page, "native-pose-selected-" + str(width))
            raw = download(page, link, "selected-native-pose.sdf")
            assert hashlib.sha256(raw).hexdigest() == preserved[selected["reference"]["asset_id"]]
            result.get_by_role("tab", name="二维结构", exact=True).click()
            drawing = result.get_by_role(
                "img",
                name="二维分子结构 · 姿势 " + str(selected["evidence"]["record"] + 1),
                exact=True,
            )
            expect(drawing).to_be_visible(timeout=30000)
            assert drawing.evaluate("image => image.complete && image.naturalWidth > 0")
            capture(page, "native-pose-selected-2d")
            result.get_by_role("tab", name="三维结构", exact=True).click()
            result.get_by_role("button", name="计算此姿势分子性质", exact=True).click()
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
            expect(page.locator(".pose-detail:visible")).to_have_count(0)
            page.get_by_role("button", name="下一步", exact=True).click()
            expect(
                page.get_by_role("combobox", name="分子文件（可含多个记录）", exact=True)
            ).to_have_value(selected["reference"]["asset_id"])
            capture(page, "native-pose-properties-handoff")
            page.get_by_role("button", name="← 返回结果", exact=True).click()
            result.get_by_role("button", name="在配套受体上重新评分", exact=True).click()
            expect(
                page.get_by_role("combobox", name="受体结构 · 复用研究资产", exact=True)
            ).to_have_value(outcome["combination"]["receptor"]["version_id"])
            expect(
                page.get_by_role("combobox", name="选择分子或已有姿势 · 复用研究资产", exact=True)
            ).to_have_value(selected["reference"]["version_id"])
            capture(page, "native-pose-rescore-handoff")
            assert (
                preserve_assets(
                    page,
                    [outcome["combination"]["receptor"], *[pose["reference"] for pose in poses]],
                )
                == preserved
            )
            assert (
                page.request.get(base + "/api/jobs").json() == before
                and not errors
                and not submissions
            )
            (EVIDENCE / "pose-selection.json").write_text(
                json.dumps(
                    {
                        "native_set": saved["id"],
                        "geometries": geometries,
                        "sources_preserved": preserved,
                        "errors": errors,
                        "submissions": submissions,
                    },
                    indent=2,
                )
            )
        finally:
            browser.close()


def test_native_receptor_members_overlay_downloads_and_pocket_handoff():
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, geometries = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        try:
            open_result(page, "对齐多个受体构象")
            result = page.get_by_role("region", name="受体构象集合结果", exact=True)
            expect(result).to_be_visible()
            example = page.request.get(base + "/api/examples/biopython.ensemble").json()
            job_id = example["pin"]["job_id"]
            native = page.request.get(base + "/api/jobs/" + job_id + "/result").json()
            for _ in range(8):
                if "members" in native:
                    break
                native = native["result"]
            assert "members" in native
            selected = next(
                row for row in native["members"] if row["status"] == "aligned" and row["artifact"]
            )
            reference = next(row for row in native["members"] if row["status"] == "reference")
            originals = [row["source"]["structure"] for row in native["members"]]
            preserved = preserve_assets(page, originals)
            table = result.get_by_role("table", name="受体构象", exact=True)
            expect(table.locator("tbody tr")).to_have_count(len(native["members"]))
            for width in (1440, 390):
                geometries.append(paired_layout(page, width, ".receptor-overlay-detail"))
                table.get_by_role(
                    "button", name="受体 " + str(reference["index"] + 1), exact=True
                ).click()
                expect(result.get_by_text("当前显示单个结构。", exact=True)).to_be_visible()
                table.get_by_role(
                    "button", name="受体 " + str(selected["index"] + 1), exact=True
                ).click()
                expect(
                    result.get_by_role("button", name="生成三维视图图片", exact=True)
                ).to_be_enabled(timeout=30000)
                expect(
                    result.get_by_text(
                        "蓝色：参照 · 橙色：所选受体。完全重合时可互相遮挡。", exact=True
                    )
                ).to_be_visible()
                capture(page, "native-receptor-overlay-" + str(width))
            aligned = result.get_by_role("link", name="下载对齐结构", exact=True)
            expected = page.request.get(base + aligned.get_attribute("href")).body()
            assert download(page, aligned, "selected-aligned-receptor.pdb") == expected
            raw = download(
                page,
                result.get_by_role("link", name="下载原始结构", exact=True),
                "selected-original-receptor.pdb",
            )
            assert (
                hashlib.sha256(raw).hexdigest()
                == preserved[selected["source"]["structure"]["asset_id"]]
            )
            result.get_by_role("button", name="用此受体寻找口袋", exact=True).click()
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
            expect(
                page.get_by_role("combobox", name="选择蛋白结构 · 复用研究资产", exact=True)
            ).not_to_have_value("")
            capture(page, "native-receptor-pocket-handoff")
            assert preserve_assets(page, originals) == preserved
            assert page.request.get(base + "/api/jobs").json() == before and not errors
            (EVIDENCE / "receptor-selection.json").write_text(
                json.dumps(
                    {
                        "native_job": job_id,
                        "geometries": geometries,
                        "sources_preserved": preserved,
                        "errors": errors,
                    },
                    indent=2,
                )
            )
        finally:
            browser.close()
