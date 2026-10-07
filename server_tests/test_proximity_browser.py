"""Real native ternary results, fresh guided inputs and downloadable structures."""

import hashlib
import json
import os
from pathlib import Path

from browser_platform import platform
from playwright.sync_api import expect, sync_playwright


def test_ternary_fixed_result_and_stepwise_submission():
    root = Path(os.environ["WB_PROXIMITY_CASE"])
    accepted = json.loads((root / "acceptance.json").read_text())
    result = json.loads((root / "result.json").read_text())
    errors, submissions = [], []
    with platform(root / "state", root / "browser-server.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch()
            page = browser.new_page(viewport={"width": 1600, "height": 1050})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: (
                    submissions.append(request.url)
                    if request.method == "POST" and request.url.endswith("/api/jobs")
                    else None
                ),
            )
            page.goto(base)
            page.get_by_role("navigation", name="主导航").get_by_role(
                "button", name="诱导邻近设计", exact=True
            ).click()
            expect(
                page.get_by_role("heading", name="1. 选择分子与目标", exact=True)
            ).to_be_visible()
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
            expect(page.get_by_role("radio", name="PROTAC 降解剂", exact=True)).to_be_checked()
            expect(page.get_by_role("radio", name="分别有两端结合姿势", exact=True)).to_be_checked()
            expect(
                page.locator(".questionnaire-actions").get_by_role(
                    "button", name="下一步", exact=True
                )
            ).to_be_disabled()
            page.screenshot(path=str(root / "proximity-fresh.png"), full_page=True)
            page.get_by_role("button", name="示例结果", exact=True).click()
            expect(
                page.get_by_role("heading", name="PROTAC 降解剂 · 三元装配", exact=True)
            ).to_be_visible()
            table = page.locator(".proximity-comparison .research-table")
            expect(table.locator("tbody tr")).to_have_count(3)
            viewer = page.locator(".proximity-assembly-preview iframe")
            expect(viewer).to_have_count(1)
            expect(viewer.content_frame.locator("canvas")).to_be_visible(timeout=20000)
            expect(page.get_by_text("基本几何通过", exact=True).first).to_be_visible()
            page.screenshot(path=str(root / "proximity-assemblies.png"), full_page=True)
            for width in (1280, 1366):
                page.set_viewport_size({"width": width, "height": 1050})
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                # The previous 1300px layout squeezed Chinese headings into vertical text.
                headers = table.locator(".research-table-scroll thead th")
                assert headers.evaluate_all(
                    "nodes => nodes.every(node => node.getBoundingClientRect().height <= 50)"
                ), "Assembly headers must stay readable at ordinary desktop widths."
                assert table.locator(".research-table-scroll").evaluate(
                    "node => node.scrollWidth <= node.clientWidth + 1"
                ), "The desktop result table must fit its assigned column."
                page.screenshot(path=str(root / f"proximity-desktop-{width}.png"), full_page=True)
            page.set_viewport_size({"width": 1600, "height": 1050})
            first = next(
                (row for row in result["proximity"]["assemblies"] if row["quality"]["accepted"]),
                result["proximity"]["assemblies"][0],
            )
            with page.expect_download() as info:
                page.get_by_role("link", name="下载分子 SDF", exact=True).click()
            saved = Path(info.value.path())
            assert (
                hashlib.sha256(saved.read_bytes()).hexdigest()
                == result["artifact_sha256"][first["ligand_artifact"]]
            )
            page.get_by_role("tab", name="分子二维", exact=True).click()
            expect(page.locator(".proximity-assembly-preview .molecule-image img")).to_be_visible(
                timeout=30000
            )
            page.screenshot(path=str(root / "proximity-molecule-2d.png"), full_page=True)
            page.get_by_role("tab", name="连接位点", exact=True).click()
            geometry = result["proximity"]["attachment_geometry"]["assemblies"]
            current = next(row for row in geometry if row["id"] == first["id"])
            count = sum(bond["direction"] is not None for bond in current["bonds"])
            markers = page.get_by_label("连接位点标记", exact=True)
            expect(markers).to_have_text(f"{count} 处连接标记", timeout=30000)
            cuts = page.get_by_role("table", name="当前构象的连接位点", exact=True)
            expect(cuts.locator("tbody tr")).to_have_count(len(current["bonds"]))
            panel = page.locator(".attachment-directions")
            with page.expect_download() as info:
                panel.get_by_role("button", name="导出筛选结果", exact=True).click()
            csv = Path(info.value.path()).read_text(encoding="utf-8-sig")
            assert "Current bond length (angstrom)" in csv and "Direction x" in csv
            page.screenshot(path=str(root / "proximity-attachment-directions.png"), full_page=True)
            first_cut = cuts.locator("tbody tr").first
            first_cut.click()
            expect(markers).to_have_text("1 处连接标记")
            for width in (1280, 1366, 390):
                page.set_viewport_size({"width": width, "height": 1050})
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                page.screenshot(
                    path=str(root / f"proximity-attachments-{width}.png"), full_page=True
                )
            page.get_by_role("tab", name="完整复合物", exact=True).click()
            page.set_viewport_size({"width": 860, "height": 1000})
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=str(root / "proximity-compact.png"), full_page=True)
            page.set_viewport_size({"width": 1600, "height": 1050})
            page.get_by_role("button", name="使用此模板", exact=True).click()
            expect(page.get_by_role("radio", name="有完整复合物", exact=True)).to_be_checked()
            for number, heading in enumerate(("招募端 · E3 连接酶", "目标蛋白", "确认探索方案"), 2):
                page.locator(".questionnaire-actions").get_by_role(
                    "button", name="下一步", exact=True
                ).click()
                expect(
                    page.get_by_role("heading", name=f"{number}. {heading}", exact=True)
                ).to_be_visible()
                expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            expect(page.get_by_role("button", name="开始三元建模", exact=True)).to_be_enabled()
            page.screenshot(path=str(root / "proximity-review.png"), full_page=True)
            page.get_by_role("button", name="设置与帮助", exact=True).click()
            page.get_by_role("menuitem", name="界面设置", exact=True).click()
            page.locator("#settings-language").select_option("en")
            page.get_by_role("navigation", name="Main navigation").get_by_role(
                "button", name="Induced proximity", exact=True
            ).click()
            page.get_by_role("button", name="Example results", exact=True).click()
            english = page.get_by_role("table", name="Compare assemblies", exact=True)
            expect(english).to_be_visible()
            for width in (1280, 1366):
                page.set_viewport_size({"width": width, "height": 1050})
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                assert english.locator("..").evaluate(
                    "node => node.scrollWidth <= node.clientWidth + 1"
                ), "English assembly metrics must fit ordinary desktop widths."
                page.screenshot(path=str(root / f"proximity-english-{width}.png"), full_page=True)
            assert not submissions, (
                "Viewing fixed evidence and filling a template must not submit jobs."
            )
            assert not errors
            browser.close()
    (root / "browser-acceptance.json").write_text(
        json.dumps(
            {
                "source_revision": accepted["source_revision"],
                "job_id": accepted["job_id"],
                "native_assemblies": 3,
                "fixed_results_not_personal_jobs": True,
                "real_sdf_download": True,
                "fresh_input_default": True,
                "one_visible_step": True,
                "readable_compact_layout": True,
                "readable_english_desktop_layout": True,
                "owner_inference": False,
            },
            indent=2,
        )
    )
