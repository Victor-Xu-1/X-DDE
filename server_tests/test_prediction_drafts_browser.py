"""Compiled bilingual save/resume against real SQLite, with all model work paused."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_unfinished_mol1_draft_round_trip(language, width):
    evidence = Path("outputs/prediction-drafts") / f"{language}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"])
    assert state.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    sequence = "".join(
        Path("src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta")
        .read_text()
        .splitlines()[1:]
    )
    warhead = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    errors, writes = [], []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#view=new&tool=mol1.predict")
        protein = page.get_by_role(
            "textbox", name=label("One-letter amino-acid sequence", "单字母氨基酸序列"), exact=True
        )
        ligand = page.get_by_role(
            "textbox", name=label("SMILES or CCD_ identifier", "SMILES 或 CCD_ 编号"), exact=True
        )
        protein.fill(sequence)
        ligand.fill(warhead)
        name = page.get_by_label(label("Task name (optional)", "任务名称（可选）"), exact=True)
        name.fill("STAT6 draft " + language)
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        page.get_by_label(label("Sequence evolutionary information", "序列进化信息")).select_option(
            "none"
        )
        next_step.click()
        page.get_by_text(label("Advanced computation", "专业计算设置"), exact=True).click()
        seeds = page.get_by_label(
            label(
                "Additional seeds (comma-separated, up to 7)", "额外随机种子（逗号分隔，最多 7 个）"
            ),
            exact=True,
        )
        seeds.fill("101,,unfinished,")
        page.get_by_label(label("Primary seed", "主随机种子"), exact=True).fill("-1")
        expect(next_step).to_be_disabled()
        page.get_by_role("button", name=label("Save draft", "保存草稿"), exact=True).click()
        expect(
            page.get_by_text(label("Saved · Not submitted", "已保存 · 尚未提交"), exact=True)
        ).to_be_visible()
        active = page.request.get(base + "/api/prediction-drafts").json()
        assert len(active) == 1
        identifier = active[0]["id"]
        saved = page.request.get(base + "/api/prediction-drafts/" + identifier).json()
        assert saved["state"]["seed_text"] == "101,,unfinished," and saved["state"]["seed"] == -1
        page.reload()
        expect(protein).to_have_value("")  # Fresh new task, never auto-resume an old draft.
        opener = page.get_by_role("button", name=label("Open drafts", "打开草稿"), exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=label("Drafts", "草稿"), exact=True)
        expect(dialog).to_be_visible()
        page.get_by_label(label("Search task name", "搜索任务名称"), exact=True).fill(
            "STAT6 draft " + language
        )
        expect(dialog.get_by_text("STAT6 draft " + language, exact=True)).to_be_visible()
        assert dialog.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
        box = dialog.bounding_box()
        assert box and box["x"] >= 0 and box["x"] + box["width"] <= width + 1
        page.screenshot(path=str(evidence / "saved-drafts.png"))
        dialog.get_by_role("button", name=label("Resume", "继续编辑"), exact=True).click()
        expect(protein).to_have_value("")
        dialog.get_by_role(
            "button", name=label("Resume this draft", "恢复此草稿"), exact=True
        ).click()
        expect(dialog).to_have_count(0)
        expect(protein).to_have_value(sequence)
        expect(ligand).to_have_value(warhead)
        expect(name).to_have_value("STAT6 draft " + language)
        next_step.click()
        expect(
            page.get_by_label(label("Sequence evolutionary information", "序列进化信息"))
        ).to_have_value("none")
        next_step.click()
        page.get_by_text(label("Advanced computation", "专业计算设置"), exact=True).click()
        expect(seeds).to_have_value("101,,unfinished,")
        expect(next_step).to_be_disabled()
        overview = page.locator(".prediction-setup")
        expect(overview).to_contain_text(label("Check seed values", "检查种子数值"))
        expect(overview).not_to_contain_text("NaN")
        expect(overview.get_by_text("—", exact=True)).to_be_visible()
        page.screenshot(path=str(evidence / "resumed-unfinished-setup.png"))
        name.fill("STAT6 revised " + language)
        page.get_by_role("button", name=label("Save draft", "保存草稿"), exact=True).click()
        expect(
            page.get_by_text(label("Saved · Not submitted", "已保存 · 尚未提交"), exact=True)
        ).to_be_visible()
        updated = page.request.get(base + "/api/prediction-drafts/" + identifier).json()
        assert updated["revision"] == 2
        opener.click()
        dialog.get_by_role("button", name=label("Archive", "归档"), exact=True).click()
        expect(
            dialog.get_by_role("heading", name=label("No drafts yet", "还没有草稿"), exact=True)
        ).to_be_visible()
        dialog.get_by_role("button", name=label("Archived", "已归档"), exact=True).click()
        row = dialog.locator("li").filter(has_text="STAT6 revised " + language)
        row.get_by_role("button", name=label("Restore", "恢复"), exact=True).click()
        expect(row).to_have_count(0)
        dialog.get_by_role("button", name=label("Saved drafts", "查看草稿"), exact=True).click()
        expect(dialog.get_by_text("STAT6 revised " + language, exact=True)).to_be_visible()
        dialog.get_by_role("button", name=label("Archive", "归档"), exact=True).click()
        expect(
            dialog.get_by_role("heading", name=label("No drafts yet", "还没有草稿"), exact=True)
        ).to_be_visible()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()
        assert not errors, errors
        assert all("/api/prediction-drafts/" in url for url in writes), writes
        assert page.request.get(base + "/api/jobs").json() == []
        assert page.request.get(base + "/api/assets").json() == []
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "viewport_width": width,
                    "sequence_length": len(sequence),
                    "draft_id": identifier,
                    "raw_seed_text_preserved": True,
                    "fresh_default": True,
                    "archive_restore": True,
                    "job_writes": 0,
                    "asset_writes": 0,
                    "page_errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
