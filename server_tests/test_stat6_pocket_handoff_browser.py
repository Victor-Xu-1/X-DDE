"""Replay real STAT6 pocket inputs into each downstream review without submitting."""

import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store

EVIDENCE = Path("server_tests/evidence/pocket-results")
WARHEAD = (
    Path(__file__).resolve().parents[1]
    / "src/opendde_workbench/examples/stat6/inputs/STAT6-user-warhead.sdf"
)
FIXTURE_NAME = "STAT6 user warhead handoff fixture.sdf"


@pytest.fixture(scope="module")
def warhead():
    settings = Settings.from_env()
    runner = os.environ.get("RUNNER_TEMP")
    if os.environ.get("CI") != "true" or not runner:
        pytest.skip("Requires isolated CI browser state")
    state = settings.state_dir.resolve()
    assert state.is_relative_to(Path(runner).resolve())
    assert state.name == "state" and state.parent.name == "x-dde-pocket-results"
    store = Store(state / "jobs.sqlite3")
    return AssetStore(store, state / "assets").save(FIXTURE_NAME, "ligand", WARHEAD.read_bytes())


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_fixed_stat6_pocket_handoff_reaches_exact_downstream_reviews(language, width, warhead):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"].rstrip("/")
    zh = language == "zh"

    def label(en, cn):
        return cn if zh else en

    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def read_only(route):
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", read_only)

        def data(path):
            response = page.request.get(base + "/api/" + path)
            assert response.ok, path
            return response.json()

        pocket_example = data("examples/p2rank.detect")
        assert pocket_example["study"]["id"] == "stat6"
        job_id = pocket_example["pin"]["job_id"]
        result = data(f"jobs/{job_id}/result")
        assert result["operation"] == "pocket_search"
        site = result["pockets"][1]
        original = result["protein"]
        center = [site[f"center_{axis}"] for axis in "xyz"]
        jobs = data("jobs")
        page.goto(f"{base}/#task={job_id}")
        pick = page.get_by_role(
            "button", name=f"{label('Pocket', '口袋')} {site['rank']}", exact=True
        )
        pick.click()
        selected = page.get_by_role("region", name=label("Selected pocket", "所选口袋"))
        name = f"{label('Predicted pocket', '预测口袋')} {site['rank']}"
        origin = page.get_by_role("region", name=label("Starting research inputs", "起始研究材料"))

        def open_handoff(action):
            selected.get_by_role("button", name=action, exact=True).click()
            expect(origin.get_by_role("heading", name=name)).to_be_visible()
            link = origin.get_by_role("link", name=label("Original receptor", "原始受体"))
            raw = page.request.get(base + link.get_attribute("href")).body()
            assert hashlib.sha256(raw).hexdigest() == original["sha256"]
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")

        def review():
            questionnaire = page.locator(".task-workspace.is-input .questionnaire:visible")
            for _ in range(3):
                questionnaire.get_by_role(
                    "button", name=label("Next", "下一步"), exact=True
                ).click()
            questionnaire.get_by_role("button", name=label("Preview job", "预览任务")).click()
            dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"))
            dialog.get_by_role("button", name=label("Request JSON", "提交内容")).click(
                timeout=30000
            )
            request = json.loads(
                dialog.get_by_label(
                    label("X-DDE submission request", "X-DDE 提交请求")
                ).inner_text()
            )
            return dialog, request

        def return_to_site(dialog):
            dialog.get_by_role("button", name=label("Back to edit", "返回编辑")).click()
            page.get_by_role(
                "button", name=label("← Back to results", "← 返回结果"), exact=True
            ).click()
            expect(pick).to_have_attribute("aria-pressed", "true")

        open_handoff(label("Explore poses in this pocket", "探索这个口袋的结合模式"))
        expect(origin).to_contain_text("20 × 20 × 20 Å")
        toggle = origin.get_by_role(
            "button", name=label("Preview starting structure", "预览起始结构")
        )
        toggle.click()
        preview = page.get_by_role("region", name=label("Starting structure", "起始结构"))
        expect(
            preview.get_by_role("button", name=label("Export figure ↓", "文献图导出 ↓"))
        ).to_be_enabled(timeout=30000)
        expect(preview.frame_locator("iframe").locator("canvas").first).to_be_visible()
        preview_rect = preview.bounding_box()
        form_rect = page.locator(".task-workspace.is-input .questionnaire:visible").bounding_box()
        assert preview_rect and form_rect
        if zh:
            assert preview_rect["y"] + preview_rect["height"] <= form_rect["y"] + 1
        else:
            assert preview_rect["x"] + preview_rect["width"] <= form_rect["x"] + 1
            assert abs(preview_rect["y"] - form_rect["y"]) <= 16
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        origin.evaluate("(node) => window.scrollBy(0, node.getBoundingClientRect().top - 82)")
        page.screenshot(path=EVIDENCE / f"stat6-{language}-docking-origin.png")
        toggle.click()
        expect(preview).to_have_count(0)

        picker = page.locator(".diff-reference:visible").filter(
            has=page.get_by_role(
                "heading",
                name=label("Choose a molecule or existing pose", "选择分子或已有姿势"),
                exact=True,
            )
        )
        picker.get_by_role("radio", name=label("Historical files", "历史文件")).check()
        picker.get_by_role("searchbox").fill(FIXTURE_NAME)
        picker.get_by_role("combobox").select_option("file:" + warhead.id)

        dialog, docking = review()
        assert docking["operation"] == "docking"
        assert docking["receptor"] == original
        assert docking["ligand"]["sha256"] == warhead.sha256
        assert docking["ligand"]["record"] == 0
        assert docking["search"] == {
            "kind": "box",
            "frame": original,
            "box": {"center": center, "size": [20, 20, 20], "unit": "angstrom"},
        }
        return_to_site(dialog)

        open_handoff(label("Generate molecules in this pocket", "用这个口袋生成分子"))
        expect(origin).to_contain_text(str(len(site["residues"])))
        dialog, design = review()
        assert design["operation"] == "diffsbdd"
        assert design["payload"]["mode"] == "generate"
        assert design["payload"]["protein"] == original
        assert design["payload"]["pocket"] == {"kind": "residues", "residues": site["residues"]}
        return_to_site(dialog)

        assert not writes and not errors, (writes, errors)
        assert data("jobs") == jobs
        assert data(f"jobs/{job_id}/result") == result
        browser.close()
