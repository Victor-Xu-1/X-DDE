"""Verify local backend switches across the catalogue without running a job."""
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from opendde_workbench.requests import Properties
from opendde_workbench.store import Store
from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/module-backend-switches")


def controls(page, zh=False):
    return page.get_by_role(
        "group", name="此任务的后端" if zh else "Backend for this task", exact=True
    )


def open_capability(page, base, tool):
    page.goto(f"{base}/#view=new&tool={tool}")
    return controls(page, zh=True).and_(page.locator(f'[data-capability="{tool}"]'))


def module_power(page):
    trigger = page.get_by_role("button", name="后端管理", exact=True)
    panel = page.get_by_role("region", name="本模块的后端", exact=True)
    return trigger, panel


def verify_catalogue(page, base, snapshot):
    catalogue = page.request.get(base + "/api/capabilities").json()["capabilities"]
    expected = {
        spec["id"] for spec in catalogue
        if spec["frontend_form"] and spec["environment"] != "platform"
    } - {"resources"}
    checked = []
    for spec in catalogue:
        key = spec["id"]
        if not spec.get("frontend_form") or key == "resources":
            continue
        owner = snapshot["capabilities"].get(key)
        if owner is None:
            assert key in {"experimental.evidence", "regions", "workflows", "pose_exploration"}
            continue
        panel = open_capability(page, base, key)
        row = panel.locator(f'[data-engine="{owner}"]')
        switch = row.get_by_role("switch")
        expect(switch).to_be_visible()
        expect(switch).not_to_be_checked()
        if owner == "harness":
            service = panel.locator('[data-engine="native-compute"]').get_by_role("switch")
            expect(service).to_be_visible()
            expect(service).not_to_be_checked()
            expect(service).to_be_disabled()  # The isolated platform has no native model installed.
        expect(panel.get_by_role("switch")).to_have_count(2 if owner == "harness" else 1)
        checked.append(key)
    assert set(checked) == expected
    return checked


def verify_composite_tools(page, base):
    for tool, owner in (("regions", "diffsbdd"), ("pose_exploration", "gnina")):
        page.goto(f"{base}/#view=new&tool={tool}")
        panel = controls(page, zh=True)
        expect(panel.locator(f'[data-engine="{owner}"]').get_by_role("switch")).not_to_be_checked()
        expect(panel.get_by_role("switch")).to_have_count(1)

    page.goto(f"{base}/#view=new&tool=experimental.evidence")
    expect(page.get_by_role("button", name="下一步")).to_be_visible()
    expect(controls(page, zh=True)).to_have_count(0)


def verify_shared_power(page, base):
    page.set_viewport_size({"width": 390, "height": 775})
    tool = open_capability(page, base, "discovery.target")
    button = tool.get_by_role("switch")
    expect(button).to_be_enabled()
    expect(button).not_to_be_checked()
    observed = page.locator(".backend-module-status")
    expect(observed).to_have_attribute("data-power", "off")
    page.get_by_role("textbox", name="靶点名称或基因符号").fill("STAT6")
    page.get_by_role("checkbox", name="允许将名称或数据库编号发送到公共数据库查询").check()
    search = page.get_by_role("button", name="查找", exact=True)
    expect(search).to_be_disabled()
    button.press("Space")
    expect(button).to_be_checked()
    expect(observed).to_have_attribute("data-power", "on")
    expect(search).to_be_enabled()
    sibling = open_capability(page, base, "discovery.disease")
    expect(sibling.get_by_role("switch")).to_be_checked()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=EVIDENCE / "local-power-390.png")

    trigger, module = module_power(page)
    trigger.click()
    local_toggle = module.locator('[data-engine="discovery"]').get_by_role("switch")
    expect(local_toggle).to_be_checked()
    page.get_by_role("button", name="查看全部后端", exact=True).click()
    global_panel = page.get_by_role("region", name="后端启停", exact=True)
    global_toggle = global_panel.locator('[data-engine="discovery"]').get_by_role("switch")
    expect(global_toggle).to_be_checked()
    expect(global_panel.locator('[data-engine="chemistry"]').get_by_role("switch")).not_to_be_checked()
    page.get_by_role("button", name="返回本模块", exact=True).click()
    expect(local_toggle).to_be_checked()
    page.mouse.click(4, 600)
    expect(module).to_have_count(0)
    nav = page.get_by_role("navigation", name="模块工作区")
    nav.get_by_role("button", name="任务结果", exact=True).click()
    trigger.click()
    expect(local_toggle).to_be_checked()
    local_toggle.click()
    expect(local_toggle).not_to_be_checked()
    page.get_by_role("button", name="查看全部后端", exact=True).click()
    expect(global_toggle).not_to_be_checked()
    global_toggle.press("Escape")
    expect(trigger).to_be_focused()
    expect(global_panel).to_have_count(0)
    expect(open_capability(page, base, "discovery.disease").get_by_role(
        "switch"
    )).not_to_be_checked()
    expect(observed).to_have_attribute("data-power", "off")


def verify_modules(page, base):
    groups = {
        "targets": {"discovery", "harness"},
        "structures": {"opendde", "mol1", "boltz", "biopython", "diffsbdd"},
        "binding": {"apbs", "biopython", "caver", "diffsbdd", "gnina", "p2rank",
                    "plip", "posebusters"},
        "screening": {"chemistry", "drugclip", "gnina"},
        "del": {"deli"},
        "molecules": {"chemistry", "diffsbdd", "reinvent"},
        "proximity": {"deepternary"},
        "biologics": {"anarcii", "boltzgen", "harness", "ligandmpnn", "sapiens"},
        "simulations": {"gromacs", "openfe", "openmm"},
        "evaluation": {"admet", "chemistry", "chemprop", "diffsbdd"},
    }
    for module, engines in groups.items():
        width = 320 if module == "binding" else 390
        page.set_viewport_size({"width": width, "height": 775})
        page.goto(f"{base}/#view=results&module={module}")
        trigger, panel = module_power(page)
        expect(page.locator(".backend-module-status")).to_have_attribute("data-power", "off")
        expect(panel).to_have_count(0)
        trigger.press("Space")
        expect(panel).to_be_visible()
        expected = engines | ({"native-compute"} if "harness" in engines else set())
        expect(panel.get_by_role("switch")).to_have_count(len(expected))
        assert set(panel.locator("[data-engine]").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.engine)"
        )) == expected
        assert all(not toggle.is_checked() for toggle in panel.get_by_role("switch").all())
        bounds = panel.bounding_box()
        assert bounds and 0 <= bounds["x"] and bounds["x"] + bounds["width"] <= width
        if module == "binding":
            page.screenshot(path=EVIDENCE / "module-power-320.png")
        panel.get_by_role("button", name="关闭后端面板", exact=True).press("Escape")
        expect(panel).to_have_count(0)
        expect(trigger).to_be_focused()
        nav = page.get_by_role("navigation", name="模块工作区")
        nav.get_by_role("button", name="新建任务", exact=True).click()
        trigger.click()
        expect(panel.get_by_role("switch")).to_have_count(len(expected))
        panel.get_by_role("button", name="关闭后端面板", exact=True).press("Escape")
        expect(panel).to_have_count(0)
        expect(trigger).to_be_focused()
    return list(groups)


def verify_utilities(page, base):
    page.goto(base + "/#view=utilities")
    trigger, module = module_power(page)
    trigger.click()
    expect(module.get_by_role("switch")).to_have_count(2)
    assert set(module.locator("[data-engine]").evaluate_all(
        "(rows) => rows.map((row) => row.dataset.engine)"
    )) == {"admet", "chemistry"}
    trigger.press("Escape")
    for label, engine in (
        ("ADMET 预测", "admet"),
        ("透脑评估", "admet"),
        ("分子性质", "chemistry"),
        ("相似性与结构筛查", "chemistry"),
        ("质子化与互变异构", "chemistry"),
    ):
        page.get_by_role("button", name=label, exact=True).click()
        panel = controls(page, zh=True)
        toggle = panel.locator(f'[data-engine="{engine}"]').get_by_role("switch")
        expect(toggle).to_be_visible()
        expect(toggle).not_to_be_checked()
        expect(panel.get_by_role("switch")).to_have_count(1)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=EVIDENCE / "utility-power-390.png")


def verify_result_detail(page, base, job_id):
    page.set_viewport_size({"width": 1450, "height": 950})
    page.goto(f"{base}/#task={job_id}")
    heading = page.get_by_role("heading", name="Backend control history fixture", exact=True)
    expect(heading).to_be_visible()
    trigger, module = module_power(page)
    trigger.click()
    expect(module.locator('[data-engine="chemistry"]').get_by_role("switch")).not_to_be_checked()
    expect(module.locator('[data-engine="admet"]').get_by_role("switch")).to_be_visible()
    expect(module.locator('[data-engine="discovery"]')).to_have_count(0)
    task_switch = page.locator('[data-backend-placement="result"] [data-engine="chemistry"]')
    expect(task_switch.get_by_role("switch")).not_to_be_checked()
    page.screenshot(path=EVIDENCE / "result-power-1450.png")


def test_contextual_switches_bind_to_runtime_authority(tmp_path):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    state_dir = tmp_path / "state"
    store = Store(state_dir / "jobs.sqlite3")
    fixture = store.create(
        Properties(name="Backend control history fixture", smiles=["c1ccccc1"]),
        "module-power-detail",
        10,
        100,
    )
    store.cancel(fixture.id)
    with platform(state_dir, EVIDENCE / "server.log") as base, sync_playwright() as driver:
        chromium = driver.chromium.launch(channel="chrome")
        page = chromium.new_page(viewport={"width": 1450, "height": 950})
        page.add_init_script("localStorage.setItem('opendde-workbench.language', 'zh')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        state = page.request.get(base + "/api/runtime-controls").json()
        assert all(not entry["enabled"] and not entry["active"] for entry in state["engines"])
        posts = []

        def record(request):
            if request.method == "POST" and request.url.startswith(base + "/api/"):
                posts.append(request.url.removeprefix(base))

        page.on("request", record)
        checked = verify_catalogue(page, base, state)
        verify_composite_tools(page, base)
        modules = verify_modules(page, base)
        verify_result_detail(page, base, fixture.id)
        assert posts == []
        verify_shared_power(page, base)
        verify_utilities(page, base)
        after = page.request.get(base + "/api/runtime-controls").json()
        assert all(not entry["enabled"] and not entry["active"] for entry in after["engines"])
        assert page.request.get(base + "/api/jobs").json() == before
        assert posts == [
            "/api/runtime-controls/discovery/start",
            "/api/runtime-controls/discovery/stop",
        ]
        (EVIDENCE / "coverage.json").write_text(
            json.dumps({"task_forms": checked, "modules": modules, "posts": posts}, indent=2),
            encoding="utf-8",
        )
        chromium.close()
