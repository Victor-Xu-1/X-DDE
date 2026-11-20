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


def assert_pocket_desktop_rail(workspace, width):
    view = workspace.locator(".structure-workbench-view").bounding_box()
    details = workspace.locator(".structure-workbench-details").bounding_box()
    assert view and details
    assert view["x"] + view["width"] <= details["x"]
    assert view["width"] > details["width"]
    if width >= 1180:
        navigation = workspace.locator(".structure-workbench-toolbar").bounding_box()
        assert navigation and abs(view["y"] - navigation["y"]) <= 2
        assert abs(navigation["x"] - details["x"]) <= 2
        assert navigation["y"] + navigation["height"] <= details["y"]
    else:
        assert abs(view["y"] - details["y"]) <= 2


@pytest.mark.parametrize(("width", "height", "visible"), [
    (1440, 900, 0.92), (1110, 580, 0.36), (390, 775, 0.44), (320, 568, 0.05),
])
def test_saved_stat6_canvas_leads_pocket_results(width, height, visible):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    base = os.environ["WB_BROWSER_URL"].rstrip("/")
    with sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        writes = []

        def read_only(route):
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", read_only)
        case = page.request.get(base + "/api/examples/p2rank.detect").json()
        page.goto(f"{base}/#task={case['pin']['job_id']}")
        workspace = page.locator(".pocket-result-workspace")
        scene = workspace.get_by_role("region", name="Pocket 3D preview")
        stage = scene.locator(".molecular-stage iframe")
        expect(scene.get_by_role(
            "button", name="Export figure ↓", exact=True,
        )).to_be_enabled(timeout=30000)
        expect(stage).to_be_in_viewport(ratio=visible)

        view = workspace.locator(".structure-workbench-view").bounding_box()
        details = workspace.locator(".structure-workbench-details").bounding_box()
        assert view and details
        if width > 1000:
            assert_pocket_desktop_rail(workspace, width)
        else:
            assert view["y"] + view["height"] <= details["y"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert page.locator(".studio-topbar").evaluate("""(header) => {
          const items = [...header.children].filter((node) => node.getClientRects().length);
          const boxes = items.map((node) => node.getBoundingClientRect());
          return boxes.every((box, i) => boxes.slice(i + 1).every((other) =>
            box.right <= other.left + 1 || other.right <= box.left + 1 ||
            box.bottom <= other.top + 1 || other.bottom <= box.top + 1
          ));
        }""")
        page.screenshot(path=EVIDENCE / f"stat6-first-canvas-{width}.png")
        assert not writes
        browser.close()


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
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 775 if zh else 850})
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
        scene = page.get_by_role("region", name=label("Pocket 3D preview", "口袋三维预览"))
        stage = scene.locator(".molecular-stage iframe")
        expect(scene.get_by_role(
            "button", name=label("Export figure ↓", "文献图导出 ↓"), exact=True
        )).to_be_enabled(timeout=30000)
        expect(stage).to_be_in_viewport(ratio=0.25 if zh else 0.65)
        original_scene = stage.element_handle()
        assert original_scene
        pick = page.get_by_role(
            "button", name=f"{label('Pocket', '口袋')} {site['rank']}", exact=True
        )
        strip = page.get_by_role("region", name=label("Pocket preview selection", "口袋预览选择"))
        preview_control = strip.get_by_role(
            "button", name=f"{label('Preview pocket', '预览口袋')} {site['rank']}", exact=True
        )
        preview_control.click()
        expect(pick).to_have_attribute("aria-pressed", "true")
        selected = page.get_by_role("region", name=label("Selected pocket", "所选口袋"))
        expect(selected).to_contain_text(str(site["probability"]))
        expect(selected).to_contain_text(str(site["score"]))
        dock = selected.get_by_role(
            "button", name=label("Explore poses in this pocket", "探索这个口袋的结合模式"), exact=True
        )
        generate = selected.get_by_role(
            "button", name=label("Generate molecules in this pocket", "用这个口袋生成分子"), exact=True
        )
        if zh:
            details_jump = strip.get_by_role("button", name="口袋详情", exact=True)
            for control in (preview_control, details_jump):
                target = control.bounding_box()
                assert target and target["height"] >= 44, target
            details_jump.press("Enter")
            expect(selected).to_be_focused()
        expect(dock).to_be_in_viewport(ratio=1)
        expect(generate).to_be_in_viewport(ratio=1)
        selected.locator(".pocket-residues summary").click()
        labels = [f"{r['chain']}:{r['number']}{r['insertion_code']}" for r in site["residues"]]
        assert selected.locator(".pocket-residues li").all_text_contents() == labels
        selected.locator(".pocket-residues summary").click()
        if zh:
            scene_jump = selected.get_by_role("button", name="查看三维", exact=True)
            target = scene_jump.bounding_box()
            assert target and target["height"] >= 44, target
            scene_jump.press("Enter")
            expect(scene).to_be_focused()
        expect(stage).to_be_in_viewport(ratio=0.65)
        expect(scene.get_by_role("status").filter(
            has_text=label("Region residues located", "已定位区域残基")
        )).to_contain_text(f"{len(labels)} / {len(labels)}")
        assert original_scene.evaluate("(frame) => frame.isConnected")
        expand = scene.get_by_role(
            "button", name=label("Expand research workspace", "展开研究工作区"), exact=True
        )
        expand.click()
        expect(page.locator('.structure-workbench[data-workspace-expanded="true"]')).to_be_visible()
        assert original_scene.evaluate("(frame) => frame.isConnected")
        page.keyboard.press("Escape")
        expect(expand).to_be_focused()
        expect(pick).to_have_attribute("aria-pressed", "true")
        assert original_scene.evaluate("(frame) => frame.isConnected")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=EVIDENCE / f"stat6-{language}-pocket-workspace.png")
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
