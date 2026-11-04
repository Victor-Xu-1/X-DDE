"""Inspect a deposited STAT6 receptor and exact ligand records without running docking."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

INPUTS = Path("src/opendde_workbench/examples/stat6/inputs")


def deposited_bounds():
    """Box from deposited AK1690 heavy atoms and 4 Å padding on every side."""
    lines = (INPUTS / "9BIG-AK1690-A701.sdf").read_text().splitlines()
    atoms = [
        [float(line[axis : axis + 10]) for axis in (0, 10, 20)]
        for line in lines[4 : 4 + int(lines[3][:3])]
        if line[31:34].strip() not in {"H", "D"}
    ]
    low, high = (list(map(extreme, zip(*atoms, strict=True))) for extreme in (min, max))
    return {
        "center": [round((a + b) / 2, 4) for a, b in zip(low, high, strict=True)],
        "size": [round(b - a + 8, 4) for a, b in zip(low, high, strict=True)],
        "unit": "angstrom",
    }


@pytest.mark.parametrize("language,width,kind", [("en", 1440, "box"), ("zh", 390, "reference")])
def test_docking_review_preserves_real_stat6_sources(language, width, kind, tmp_path, monkeypatch):
    state = tmp_path / "state"
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    receptor, ligand, reference = (
        assets.save(name, role, (INPUTS / name).read_bytes())
        for name, role in (
            ("STAT6-9BIG-observed-receptor.pdb", "structure"),
            ("STAT6-native-search-poses.sdf", "ligand"),
            ("9BIG-AK1690-A701.sdf", "ligand"),
        )
    )
    evidence = Path("outputs/docking-job-review") / language
    evidence.mkdir(parents=True, exist_ok=True)
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
        page.route(
            "**/api/jobs",
            lambda route: route.abort() if route.request.method == "POST" else route.continue_(),
        )
        page.goto(base + "/#view=new&tool=gnina.dock")

        def choose(purpose, file):
            picker = page.locator(".diff-reference").filter(
                has=page.get_by_role("heading", name=purpose, exact=True)
            )
            expect(
                picker.get_by_role("radio", name=label("Upload a new file", "上传新文件"))
            ).to_be_checked()
            picker.get_by_role("radio", name=label("Historical files", "历史文件")).check()
            selector = picker.get_by_role("combobox")
            expect(selector).to_contain_text(file.name)
            selector.select_option("file:" + str(file.id))
            return picker

        choose(label("Receptor structure", "受体结构"), receptor)
        study = choose(label("Choose a molecule or existing pose", "选择分子或已有姿势"), ligand)
        study.get_by_role(
            "spinbutton",
            name=label("Molecule record in SDF (starts at 1)", "SDF 中第几个分子（从 1 开始）"),
        ).fill("2")
        next_step = page.get_by_role("button", name=label("Next", "下一步"), exact=True)
        next_step.click()
        expected = deposited_bounds() if kind == "box" else None
        if expected:
            page.get_by_role(
                "combobox", name=label("Where should the search run?", "在哪里搜索？")
            ).select_option("box")
            for axis, center, size in zip("XYZ", expected["center"], expected["size"], strict=True):
                page.get_by_role("spinbutton", name=label("Center", "中心") + f" {axis} (Å)").fill(
                    str(center)
                )
                page.get_by_role("spinbutton", name=label("Length", "边长") + f" {axis} (Å)").fill(
                    str(size)
                )
        else:
            choose(label("Reference pocket ligand", "参考口袋配体"), reference)
            page.get_by_role(
                "checkbox",
                name=label(
                    "I confirm the reference/existing pose is in the selected receptor "
                    "coordinate frame",
                    "我确认参考配体/已有姿势位于所选受体的坐标系中",
                ),
            ).check()
        next_step.click()
        next_step.click()
        opener = page.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        opener.click()
        dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"))
        geometry = dialog.get_by_role(
            "region", name=label("Receptor coordinate frame", "受体坐标系")
        )
        expect(
            geometry.get_by_role(
                "button", name=label("Export figure ↓", "文献图导出 ↓"), exact=True
            )
        ).to_be_enabled(timeout=30000)
        expect(geometry.frame_locator("iframe").locator("canvas").first).to_be_visible()
        settings = dialog.get_by_role("region", name=label("Docking plan review", "对接方案核对"))
        study_link = settings.get_by_role("link", name=ligand.name, exact=True)
        assert study_link.get_attribute("href").endswith("?record=1")
        if expected:
            expect(settings).to_contain_text(" × ".join(map(str, expected["size"])))
        else:
            pocket_link = settings.get_by_role("link", name=reference.name, exact=True)
            assert pocket_link.get_attribute("href").endswith("?record=0")
            expect(geometry).to_contain_text("Å")
        assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        left, right = geometry.bounding_box(), settings.bounding_box()
        assert left and right and left["height"] >= 330
        assert left["x"] < right["x"] if width >= 1000 else left["y"] < right["y"]
        expect(
            dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        ).to_be_disabled()
        page.screenshot(path=evidence / "overview.png")
        dialog.get_by_role("button", name=label("Request JSON", "提交内容")).click()
        payload = json.loads(
            dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert payload["operation"] == "docking" and payload["mode"] == "dock"
        assert payload["ligand"]["sha256"] == ligand.sha256 and payload["ligand"]["record"] == 1
        assert payload["receptor"]["sha256"] == receptor.sha256
        search = payload["search"]
        assert search["frame"] == payload["receptor"]
        if expected:
            assert search["kind"] == "box" and search["box"] == expected
        else:
            assert search["kind"] == "reference_ligand"
            assert search["coordinate_basis"] == "user_confirmed"
            assert search["reference"]["sha256"] == reference.sha256
            assert search["reference"]["record"] == 0
        page.keyboard.press("Escape")
        expect(opener).to_be_focused()
        assert not writes and not errors, (writes, errors)
        browser.close()
    assert not store.list_jobs()
    (evidence / "acceptance.json").write_text(json.dumps(payload, indent=2))
