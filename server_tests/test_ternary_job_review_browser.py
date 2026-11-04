"""Review exact public STAT6/CRBN inputs without starting any native calculation."""

import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

FIXTURE = Path(__file__).with_name("fixtures") / "stat6-ternary-memory"


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_ternary_review_uses_real_independent_binary_frames(language, width, tmp_path, monkeypatch):
    state = tmp_path / "state"
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    tools = Path(os.environ["WB_TERNARY_VISUAL_STATE"]).resolve()
    runner = Path(os.environ["RUNNER_TEMP"]).resolve()
    assert tools.is_relative_to(runner)
    config = (tools / "deployment.json").read_bytes()
    assert Path(json.loads(config)["root"]).resolve().is_relative_to(runner)
    (state / "deployment.json").write_bytes(config)
    case = json.loads((FIXTURE / "provenance.json").read_text())["branches"][0]
    payload = case["payload"]
    files = {}
    for role, filename in case["sources"].items():
        raw = (FIXTURE / filename).read_bytes()
        protein = role.startswith("partner")
        if role == "ligand":
            # The confirmed R input is the second record, after the real S branch.
            raw = (FIXTURE / "full-S.sdf").read_bytes() + raw
            filename = "STAT6-PROTAC-S-and-R.sdf"
        files[role] = assets.save(filename, "structure" if protein else "ligand", raw)

    zh = language == "zh"
    evidence = Path("outputs/ternary-job-review") / language
    evidence.mkdir(parents=True, exist_ok=True)
    writes, errors = [], []

    def label(en, cn):
        return cn if zh else en

    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.on("pageerror", lambda error: errors.append(str(error)))

        def read_only(route):
            if route.request.method not in {"GET", "HEAD", "OPTIONS"}:
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/**", read_only)
        page.goto(base + "/#view=new&tool=deepternary.model")
        form = page.locator(".questionnaire")
        next_step = form.get_by_role("button", name=label("Next", "下一步"), exact=True)

        def choose(purpose, role):
            picker = page.locator(".questionnaire > fieldset:visible .diff-reference").filter(
                has=page.get_by_role("heading", name=purpose, exact=True)
            )
            file = files[role]
            expect(
                picker.get_by_role("radio", name=label("Upload a new file", "上传新文件"))
            ).to_be_checked()
            picker.get_by_role("radio", name=label("Historical files", "历史文件")).check()
            selector = picker.get_by_role("combobox")
            expect(selector).to_contain_text(file.name)
            selector.select_option("file:" + str(file.id))
            return picker

        ligand = choose(
            label("Complete molecule · 3D SDF / MOL", "完整分子 · 三维 SDF / MOL"), "ligand"
        )
        ligand.get_by_role(
            "spinbutton",
            name=label("Molecule record in SDF (starts at 1)", "SDF 中第几个分子（从 1 开始）"),
        ).fill("2")
        next_step.click()
        titles = (
            label("Recruiting partner · E3 ligase", "招募端 · E3 连接酶"),
            label("Protein of interest", "目标蛋白"),
        )
        for side, title in zip("ab", titles, strict=True):
            current = page.locator(".questionnaire > fieldset:visible")
            current.get_by_role("textbox", name=label("Partner name", "伙伴名称")).fill(
                payload[f"partner_{side}_name"]
            )
            choose(title, f"partner_{side}")
            choose(
                label("Molecular fragment bound to this partner", "与这一端结合的分子片段"),
                f"arm_{side}",
            )
            chain = current.get_by_role(
                "combobox", name=title + label(" · protein chain", " · 蛋白链")
            )
            expect(chain).to_have_value(payload[f"partner_{side}_chain"], timeout=30000)
            current.get_by_text(
                label("Expert: explicit atom correspondence", "专家：指定原子对应关系"),
                exact=True,
            ).click()
            current.get_by_placeholder(
                label("Empty: unique chemical correspondence", "留空：唯一化学对应"),
            ).fill(", ".join(str(index + 1) for index in payload[f"arm_{side}_map"]))
            next_step.click()

        open_review = form.get_by_role("button", name=label("Preview job", "预览任务"), exact=True)
        open_review.click()
        dialog = page.get_by_role("dialog", name=label("Preview job", "预览任务"))
        confirm = dialog.get_by_role("button", name=label("Submit job", "提交任务"), exact=True)
        geometry = dialog.get_by_role(
            "region", name=label("Ternary modeling input structures", "三元建模输入结构")
        )
        plan = dialog.get_by_role("complementary", name=label("Assembly plan", "装配方案"))
        expect(plan).to_contain_text(label("Two separate bound poses", "两端独立的结合姿势"))
        expect(confirm).to_be_disabled()
        link = plan.get_by_role("link", name=files["ligand"].name)
        assert link.get_attribute("href").endswith("?record=1")
        downloaded = page.request.get(base + link.get_attribute("href"))
        assert downloaded.headers["x-structure-record"] == "1"
        assert downloaded.body().rstrip() == (FIXTURE / "full-R.sdf").read_bytes().rstrip()

        def scene():
            panel = geometry.get_by_role("tabpanel")
            expect(
                panel.get_by_role("button", name=label("Export figure ↓", "文献图导出 ↓"))
            ).to_be_enabled(timeout=30000)
            expect(panel.frame_locator("iframe").locator("canvas").first).to_be_visible()

        scene()
        left, right = geometry.bounding_box(), plan.bounding_box()
        assert left and right and left["height"] >= 340
        assert left["x"] < right["x"] if width >= 1000 else left["y"] < right["y"]
        assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        page.screenshot(path=evidence / "partner-a.png")
        geometry.get_by_role("tab", name=label("Protein B", "蛋白 B"), exact=True).click()
        scene()
        page.screenshot(path=evidence / "partner-b.png")
        geometry.get_by_role("tab", name=label("Complete molecule", "完整分子"), exact=True).click()
        scene()
        geometry.get_by_role(
            "button", name=label("B · 38 selected atoms", "B · 38 个选定原子")
        ).click()
        page.screenshot(path=evidence / "complete-molecule.png")
        geometry.get_by_role("tab", name=label("2D drawing", "二维结构"), exact=True).click()
        depiction = geometry.get_by_role("tabpanel").locator(".molecule-image")
        depiction.scroll_into_view_if_needed()
        expect(depiction).to_have_attribute("data-drawing-state", "ready", timeout=60000)
        page.screenshot(path=evidence / "molecule-2d.png")
        dialog.get_by_role("button", name=label("Request JSON", "提交内容"), exact=True).click()
        request = json.loads(
            dialog.get_by_label(label("X-DDE submission request", "X-DDE 提交请求")).inner_text()
        )
        assert request["operation"] == "ternary_model"
        assert request["payload"]["arm_a_map"] == payload["arm_a_map"]
        assert request["payload"]["arm_b_map"] == payload["arm_b_map"]
        assert request["scientific_inputs"] == [item["source"] for item in request["inputs"]]
        assert {item["role"] for item in request["inputs"]} == set(files)
        for item in request["inputs"]:
            source, file = item["source"], files[item["role"]]
            assert source["asset_id"] == str(file.id)
            assert source["sha256"] == file.sha256
            assert source["record"] == (1 if item["role"] == "ligand" else 0)
        dialog.get_by_role("button", name=label("Back to edit", "返回编辑"), exact=True).click()
        expect(open_review).to_be_focused()
        assert not store.list_jobs()
        assert not writes and not errors, (writes, errors)
        browser.close()


def test_glue_review_preserves_one_deposited_reference_and_distinct_chain_roles(
    tmp_path, monkeypatch
):
    from hashlib import sha256
    from zipfile import ZipFile

    from server_tests.molecular_glue_cases import CASES, SNAPSHOT_SHA256

    state = tmp_path / "state"
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    definition = CASES[0]
    entry = definition["entry"]
    archive = Path(os.environ["RUNNER_TEMP"]) / "x-dde-glue-inputs-v1.zip"
    assert sha256(archive.read_bytes()).hexdigest() == SNAPSHOT_SHA256
    with ZipFile(archive) as source:
        pdb, sdf = (source.read(f"{entry}.{suffix}") for suffix in ("pdb", "sdf"))
    assert sha256(pdb).hexdigest() == definition["pdb_sha256"]
    assert sha256(sdf).hexdigest() == definition["sdf_sha256"]
    protein = assets.save(f"{entry}.pdb", "structure", pdb)
    ligand = assets.save(f"{entry}.sdf", "ligand", sdf)

    evidence = Path("outputs/ternary-job-review") / "5fqd-glue"
    evidence.mkdir(parents=True, exist_ok=True)
    writes = []
    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")

        def block_jobs(route):
            if route.request.method == "POST":
                writes.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/jobs", block_jobs)
        page.goto(base + "/#view=new&tool=deepternary.model")
        form = page.locator(".questionnaire")
        next_step = form.get_by_role("button", name="Next", exact=True)

        def select_file(purpose, file):
            picker = page.locator(".questionnaire > fieldset:visible .diff-reference").filter(
                has=page.get_by_role("heading", name=purpose, exact=True)
            )
            picker.get_by_role("radio", name="Historical files", exact=True).check()
            choices = picker.get_by_role("combobox")
            expect(choices).to_contain_text(file.name)
            choices.select_option("file:" + str(file.id))

        form.get_by_role("radio", name="Molecular glue", exact=True).check()
        expect(form.get_by_role("radio", name="A complete reference complex")).to_have_count(0)
        select_file("Complete molecule · 3D SDF / MOL", ligand)
        next_step.click()
        form.get_by_role("textbox", name="Partner name", exact=True).fill("CRBN")
        select_file("Binding partner 1", protein)
        chain_a, chain_b = definition["chains"]
        form.get_by_role("combobox", name="Binding partner 1 · protein chain").select_option(
            chain_a
        )
        next_step.click()
        form.get_by_role("textbox", name="Partner name", exact=True).fill("CK1α")
        form.get_by_role("button", name="Use the previous complex file", exact=True).click()
        chain = form.get_by_role("combobox", name="Binding partner 2 · protein chain")
        chain.select_option(chain_a)
        expect(next_step).to_be_disabled()
        chain.select_option(chain_b)
        next_step.click()

        form.get_by_role("button", name="Preview job", exact=True).click()
        dialog = page.get_by_role("dialog", name="Preview job")
        source_tab = dialog.get_by_role("tab", name="Reference complex", exact=True)
        expect(source_tab).to_have_attribute("aria-selected", "true")
        source_view = dialog.get_by_role("tabpanel", name="Reference complex")
        expect(source_view).to_contain_text("Selected chains: CRBN · B, CK1α · C")
        expect(source_view.get_by_role("button", name="Export figure ↓")).to_be_enabled(
            timeout=30000
        )
        expect(source_view.frame_locator("iframe").locator("canvas").first).to_be_visible()
        page.screenshot(path=evidence / "source-complex.png")

        dialog.get_by_role("tab", name="Complete molecule", exact=True).click()
        molecule = dialog.get_by_role("tabpanel", name="Complete molecule")
        expect(molecule.get_by_role("button", name="Export figure ↓")).to_be_enabled(timeout=30000)
        expect(molecule.get_by_role("group", name="Inspect selected atoms")).to_have_count(0)
        dialog.get_by_role("button", name="Request JSON").click()
        request = json.loads(dialog.get_by_label("X-DDE submission request").inner_text())
        assert request["payload"]["mechanism"] == "molecular_glue"
        assert request["payload"]["anchor_partner"] == "a"
        assert all(
            not request["payload"][field]
            for field in ("arm_a_map", "arm_b_map", "binding_region_a", "binding_region_b")
        )
        refs = {item["role"]: item["source"] for item in request["inputs"]}
        assert set(refs) == {"ligand", "partner_a", "partner_b"}
        assert refs["partner_a"] == refs["partner_b"]
        assert refs["partner_a"]["sha256"] == definition["pdb_sha256"]
        assert refs["ligand"]["sha256"] == definition["sdf_sha256"]
        assert [request["payload"][f"partner_{side}_chain"] for side in "ab"] == [chain_a, chain_b]
        expect(dialog.get_by_role("button", name="Submit job")).to_be_disabled()
        assert not writes and not store.list_jobs()
        browser.close()


def test_saved_shared_complex_replays_real_mz1_binding_regions(tmp_path, monkeypatch):
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.preparation import prepare_example
    from opendde_workbench.research.storage import ScientificStore

    state = tmp_path / "state"
    monkeypatch.setenv("WB_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    store = Store(state / "jobs.sqlite3")
    cache = state / "public-example-cache"
    cache.mkdir()
    for key in ("ternary_vhl", "ternary_brd4", "ternary_mz1"):
        spec = FILES[key]
        (cache / spec.sha256).write_bytes(
            (Path(os.environ["RUNNER_TEMP"]) / spec.name).read_bytes()
        )
    assets = AssetStore(store, state / "assets")
    prepared = prepare_example("deepternary.model", ScientificStore(store, assets), cache)
    expected = prepared.request
    evidence = Path("outputs/ternary-job-review") / "5t35-shared"
    evidence.mkdir(parents=True, exist_ok=True)

    with platform(state, evidence / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script("localStorage.setItem('opendde-workbench.language','en')")
        # Replay the historical module response with its real stored refs. The
        # current catalog uses STAT6 and must keep its own study template.
        page.route(
            "**/api/examples/deepternary.model/prepare",
            lambda route: route.fulfill(json=prepared.model_dump(mode="json")),
        )
        page.goto(base + "/#view=new&tool=deepternary.model")
        page.get_by_role("button", name="Use this template", exact=True).click()
        form = page.locator(".questionnaire")
        expect(form.get_by_role("radio", name="A complete reference complex")).to_be_checked()
        for count in (None, 32, 27):
            if count is not None:
                expect(
                    form.locator("fieldset:visible").get_by_text(f"{count} atoms")
                ).to_be_visible()
            form.get_by_role("button", name="Next", exact=True).click()

        form.get_by_role("button", name="Preview job", exact=True).click()
        dialog = page.get_by_role("dialog", name="Preview job")
        expect(dialog.get_by_role("tab", name="Reference complex", exact=True)).to_have_count(0)
        dialog.get_by_role("tab", name="Complete molecule", exact=True).click()
        molecule = dialog.get_by_role("tabpanel", name="Complete molecule")
        expect(molecule.get_by_role("button", name="Export figure ↓")).to_be_enabled(timeout=30000)
        expect(molecule.get_by_role("button", name="A · 32 selected atoms")).to_have_attribute(
            "aria-pressed", "true"
        )
        molecule.get_by_role("button", name="B · 27 selected atoms").click()
        expect(molecule.get_by_role("button", name="B · 27 selected atoms")).to_have_attribute(
            "aria-pressed", "true"
        )
        page.screenshot(path=evidence / "binding-region-b.png")
        dialog.get_by_role("button", name="Request JSON").click()
        request = json.loads(dialog.get_by_label("X-DDE submission request").inner_text())
        assert request["payload"] == expected["payload"]
        # The wizard serializes ligand first; identity is keyed by its scientific role.
        assert sorted(request["inputs"], key=lambda item: item["role"]) == sorted(
            expected["inputs"], key=lambda item: item["role"]
        )
        assert request["scientific_inputs"] == [item["source"] for item in request["inputs"]]
        assert request["options"] == expected["options"]
        assert not store.list_jobs()
        browser.close()
