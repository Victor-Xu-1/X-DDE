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
    page.set_viewport_size({"width": 1280, "height": 800})
    catalogue = page.request.get(base + "/api/capabilities").json()["capabilities"]
    expected = {
        spec["id"] for spec in catalogue
        if spec["frontend_form"]
    } - {"resources", "workflows", "experimental.evidence"}
    checked = []
    for spec in catalogue:
        key = spec["id"]
        if not spec.get("frontend_form") or key == "resources":
            continue
        if key not in expected:
            continue
        owner = snapshot["capabilities"][key]
        panel = open_capability(page, base, key)
        expect(panel).to_have_attribute("data-backend-placement", "entry")
        expect(page.locator(".studio-topbar").locator(panel)).to_be_visible()
        row = panel.locator(f'[data-engine="{owner}"]')
        switch = row.get_by_role("switch")
        expect(switch).to_be_visible()
        expect(switch).not_to_be_checked()
        if owner == "harness":
            local_service = panel.locator('[data-engine="native-compute"]').get_by_role("switch")
            expect(local_service).to_be_visible()
            expect(local_service).not_to_be_checked()
            expect(local_service).to_be_disabled()
            title = page.locator(".studio-topbar .page-context-title")
            bounds = title.bounding_box()
            assert bounds and bounds["height"] <= 30 and bounds["width"] > 40
            assert title.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
            trigger, drawer = module_power(page)
            trigger.click()
            service = drawer.locator('[data-engine="native-compute"]').get_by_role("switch")
            expect(service).to_be_visible()
            expect(service).not_to_be_checked()
            expect(service).to_be_disabled()  # The isolated platform has no native model installed.
            trigger.press("Escape")
        expect(panel.get_by_role("switch")).to_have_count(2 if owner == "harness" else 1)
        checked.append(key)
    assert set(checked) == expected
    return checked


def verify_narrow_compute_entry(page, base):
    page.set_viewport_size({"width": 1024, "height": 800})
    task = open_capability(page, base, "fold")
    expect(task.get_by_role("switch", name="OpenDDE Harness")).to_be_visible()
    hidden = task.locator('[data-engine="native-compute"]')
    expect(hidden).to_be_hidden()
    trigger, drawer = module_power(page)
    trigger.click()
    service = drawer.locator('[data-engine="native-compute"]').get_by_role("switch")
    expect(service).to_be_visible()
    expect(service).not_to_be_checked()
    expect(drawer.locator("[data-engine]").nth(1)).to_have_attribute(
        "data-engine", "native-compute",
    )
    expect(service).to_be_in_viewport()
    trigger.press("Escape")


def verify_desktop_task_power_header(context, base):
    # The English titles are longer, and Harness has an additional power switch.
    page = context.new_page()
    page.add_init_script("localStorage.setItem('opendde-workbench.language', 'en')")
    toolbar = page.locator(".studio-topbar")
    search = toolbar.get_by_role("button", name="Search tasks", exact=True)
    field = toolbar.get_by_role("searchbox", name="Search tasks", exact=True)
    for tool, owner, title in (
        ("drugclip.screen", "drugclip", "High-throughput screening"),
        ("fold", "harness", "Biologics research"),
    ):
        page.goto(f"{base}/#view=new&tool={tool}")
        heading = toolbar.locator(".page-context-title")
        expect(heading).to_have_text(title)
        switch = toolbar.locator(f'[data-engine="{owner}"]').get_by_role("switch")
        for width in (1024, 1152, 1180, 1280, 1440, 1600):
            page.set_viewport_size({"width": width, "height": 800})
            expect(switch).to_be_visible()
            expect(switch).not_to_be_checked()
            if owner == "harness":
                local = toolbar.locator(
                    '[data-backend-placement="entry"] [data-engine="native-compute"]'
                )
                if width < 1280:
                    expect(local).to_be_hidden()
                else:
                    expect(local.get_by_role("switch")).not_to_be_checked()
                    expect(local).to_be_visible()
            assert heading.evaluate("""title => {
                const text = document.createRange();
                text.selectNodeContents(title);
                const lines = text.getClientRects();
                return lines.length === 1
                    && lines[0].right <= title.getBoundingClientRect().right + 1;
            }"""), (tool, width)
            assert toolbar.evaluate("""bar => {
                const bounds = bar.getBoundingClientRect();
                const parts = Array.from(bar.children).map(el => el.getBoundingClientRect());
                return parts.every((part, i) => part.left >= bounds.left
                    && part.right <= bounds.right && (!i || part.left >= parts[i - 1].right));
            }"""), (tool, width)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            if width < 1440:
                expect(field).to_be_hidden()
                search.press("Enter")
                expect(field).to_be_focused()
                field.press("Escape")
                expect(search).to_be_focused()
                expect(field).to_be_hidden()
            else:
                expect(search).to_be_hidden()
                expect(field).to_be_visible()
        page.set_viewport_size({"width": 1180, "height": 800})
        page.screenshot(path=EVIDENCE / f"{owner}-desktop-power-1180-en.png")
    page.set_viewport_size({"width": 1440, "height": 800})
    page.goto(f"{base}/#view=new&tool=discovery.import")
    expect(controls(page).locator('[data-engine="discovery"]')).to_be_visible()
    expect(search).to_be_hidden()
    expect(field).to_be_visible()
    field.fill("clear this query")
    field.press("Escape")
    expect(field).to_be_focused()
    expect(field).to_have_value("")
    field.fill("native history")
    page.set_viewport_size({"width": 1180, "height": 800})
    expect(field).to_be_focused()
    expect(field).to_have_value("native history")
    field.press("Escape")
    expect(search).to_be_focused()
    expect(field).to_be_hidden()
    page.set_viewport_size({"width": 1440, "height": 800})
    field.fill("unfocused query")
    field.press("Tab")
    expect(field).not_to_be_focused()
    page.set_viewport_size({"width": 1180, "height": 800})
    expect(field).to_be_hidden()
    page.close()


def verify_composite_tools(page, base):
    page.set_viewport_size({"width": 1280, "height": 800})
    for tool, owner in (("regions", "diffsbdd"), ("pose_exploration", "gnina")):
        panel = open_capability(page, base, tool)
        switch = panel.locator(f'[data-engine="{owner}"]').get_by_role("switch")
        expect(switch).to_be_visible()
        expect(switch).not_to_be_checked()
        expect(controls(page, zh=True).get_by_role("switch")).to_have_count(1)
        bounds = switch.bounding_box()
        assert bounds and bounds["x"] > 640 and bounds["y"] < 230
        page.screenshot(path=EVIDENCE / f"{tool}-power-1280.png")

    page.goto(f"{base}/#view=new&tool=experimental.evidence")
    expect(page.get_by_role("button", name="下一步")).to_be_visible()
    expect(controls(page, zh=True)).to_have_count(0)


def verify_setup_entry(page, base):
    page.set_viewport_size({"width": 1280, "height": 800})
    panel = open_capability(page, base, "p2rank.detect")
    switch = panel.get_by_role("switch", name="P2Rank", exact=True)
    expect(switch).not_to_be_checked()
    expect(switch).to_be_disabled()
    expect(switch).to_have_accessible_description("已关闭 · 待配置")
    setup = panel.get_by_role("link", name="配置 P2Rank（在新标签页打开）", exact=True)
    expect(setup).to_be_visible()
    page.screenshot(path=EVIDENCE / "unavailable-power-1280.png")
    trigger, drawer = module_power(page)
    expect(trigger.locator(".backend-controls-label")).to_be_visible()
    trigger.click()
    field = drawer.get_by_role("searchbox", name="搜索任务或后端")
    expect(drawer.locator("[data-engine]").first).to_have_attribute("data-engine", "p2rank")
    expect(drawer.locator('[data-engine="p2rank"]')).to_contain_text("发现多个候选口袋")
    field.fill("探索分子结合模式")
    expect(drawer.get_by_role("switch")).to_have_count(1)
    expect(drawer.get_by_role("switch", name="GNINA", exact=True)).not_to_be_checked()
    page.screenshot(path=EVIDENCE / "find-docking-backend-1280.png")
    field.fill("结合姿势聚类")
    expect(drawer.get_by_role("switch")).to_have_count(1)
    expect(drawer.locator('[data-engine="chemistry"]')).to_contain_text("结合姿势聚类")
    field.fill("OpenMM")
    expect(drawer.get_by_role("status")).to_have_text("没有匹配的后端")
    drawer.get_by_role("button", name="查看全部后端").click()
    all_backends = page.get_by_role("region", name="后端启停", exact=True)
    expect(all_backends.get_by_role("searchbox")).to_have_value("")
    all_backends.get_by_role("searchbox").fill("OpenMM")
    expect(all_backends.get_by_role("switch")).to_have_count(1)
    expect(all_backends.get_by_role("switch")).not_to_be_checked()
    all_backends.get_by_role("searchbox").press("Escape")
    expect(trigger).to_be_focused()
    with page.expect_popup() as popup:
        setup.press("Enter")
    target = popup.value
    try:
        expect(target).to_have_url(f"{base}/#view=deployment")
        expect(target.get_by_role("button", name="组件安装", exact=True)).to_be_visible()
        expect(switch).to_be_visible()
        expect(page).to_have_url(f"{base}/#view=new&tool=p2rank.detect")
    finally:
        target.close()
    for width in (390, 1024):
        page.set_viewport_size({"width": width, "height": 775})
        expect(panel.get_by_text("P2Rank", exact=True)).to_be_visible()
        status = panel.locator(".runtime-switch-status")
        expect(status.locator("small")).to_have_text("已关闭 · 待配置")
        assert status.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
        header = page.locator(".studio-topbar")
        rightmost = header.evaluate("""bar => Math.max(0, ...Array.from(
            bar.querySelectorAll("button, summary"),
            control => control.getBoundingClientRect().right
        ))""")
        assert rightmost <= width, (width, rightmost)
    search = page.get_by_role("button", name="搜索任务", exact=True)
    search.click()
    field = page.get_by_role("searchbox", name="搜索任务", exact=True)
    expect(field).to_be_focused()
    field.press("Escape")
    expect(search).to_be_focused()


def verify_shared_power(page, base):
    page.set_viewport_size({"width": 390, "height": 775})
    tool = open_capability(page, base, "discovery.target")
    button = tool.get_by_role("switch")
    expect(button).to_be_enabled()
    expect(button).not_to_be_checked()
    observed, _ = module_power(page)
    expect(observed).to_have_accessible_description("任务引擎已关闭")
    page.get_by_role("textbox", name="靶点名称或基因符号").fill("STAT6")
    page.get_by_role("checkbox", name="允许将名称或数据库编号发送到公共数据库查询").check()
    search = page.get_by_role("button", name="查找", exact=True)
    expect(search).to_be_disabled()
    button.press("Space")
    expect(button).to_be_checked()
    expect(observed).to_have_accessible_description("1 个后端已开启")
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
    chemistry = global_panel.locator('[data-engine="chemistry"]').get_by_role("switch")
    expect(chemistry).not_to_be_checked()
    page.get_by_role("button", name="返回本模块", exact=True).click()
    expect(local_toggle).to_be_checked()
    page.mouse.click(4, 600)
    expect(module).to_have_count(0)
    nav = page.get_by_role("navigation", name="模块工作区")
    nav.get_by_role("button", name="任务结果", exact=True).click()
    result_trigger, result_panel = module_power(page)
    result_trigger.press("Space")
    close = result_panel.get_by_role("button", name="关闭后端面板")
    expect(close).to_be_focused()
    result_toggle = result_panel.locator('[data-engine="discovery"]').get_by_role("switch")
    expect(result_toggle).to_be_checked()
    page.keyboard.press("Tab")
    expect(result_toggle).to_be_focused()
    # Return through the trigger before tabbing outside. Unavailable engines
    # can now provide additional focusable setup links after this switch.
    page.keyboard.press("Shift+Tab")
    expect(close).to_be_focused()
    page.keyboard.press("Shift+Tab")
    expect(result_trigger).to_be_focused()
    page.keyboard.press("Shift+Tab")
    expect(result_panel).to_have_count(0)
    result_trigger.press("Space")
    expect(close).to_be_focused()
    with page.expect_response(f"{base}/api/runtime-controls/discovery/stop") as stopped:
        result_toggle.click()
    assert stopped.value.ok and stopped.value.json() == {"enabled": False}
    expect(result_toggle).not_to_be_checked()
    result_toggle.press("Escape")
    expect(result_trigger).to_be_focused()
    trigger.click()
    expect(local_toggle).not_to_be_checked()
    page.get_by_role("button", name="查看全部后端", exact=True).click()
    expect(global_toggle).not_to_be_checked()
    global_toggle.press("Escape")
    expect(trigger).to_be_focused()
    expect(global_panel).to_have_count(0)
    expect(open_capability(page, base, "discovery.disease").get_by_role(
        "switch"
    )).not_to_be_checked()
    expect(observed).to_have_accessible_description("任务引擎已关闭")


def verify_modules(page, base):
    groups = {
        "targets": {"discovery", "harness"},
        "structures": {"opendde", "mol1", "boltz", "biopython", "diffsbdd"},
        "binding": {"apbs", "biopython", "caver", "chemistry", "diffsbdd", "gnina", "p2rank",
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
        expect(trigger.locator(".backend-module-status")).to_have_attribute("data-power", "off")
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
    return groups


def verify_utilities(page, base, companion, companion_loads):
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(base + "/#view=utilities")
    admet = page.get_by_role("button", name="ADMET 预测", exact=True)
    admet.click()
    inline = page.locator(".utility-image-entry > .image-molecule-actions").get_by_role(
        "switch", name="DECIMER", exact=True,
    )
    expect(inline).not_to_be_checked()
    expect(inline).to_be_enabled()
    expect(page.get_by_role("dialog")).to_have_count(0)
    trigger, module = module_power(page)
    trigger.click()
    expect(module.get_by_role("switch")).to_have_count(3)
    assert set(module.locator("[data-engine]").evaluate_all(
        "(rows) => rows.map((row) => row.dataset.engine)"
    )) == {"admet", "chemistry", "decimer"}
    recognition = module.locator('[data-engine="decimer"]')
    toggle = recognition.get_by_role("switch", name="DECIMER", exact=True)
    expect(recognition).to_contain_text("已关闭")
    expect(trigger).to_have_accessible_description("任务引擎已关闭")
    expect(toggle).not_to_be_checked()
    expect(toggle).to_be_enabled()
    decimer = toggle.bounding_box()
    admet_power = module.locator('[data-engine="admet"]').get_by_role("switch").bounding_box()
    assert decimer and admet_power and abs(decimer["x"] - admet_power["x"]) < 1
    toggle.press("Space")
    expect(toggle).to_be_checked()
    expect(inline).to_be_checked()
    expect(trigger).to_have_accessible_description("1 个后端已开启")
    expect(admet).to_have_attribute("aria-pressed", "true")
    toggle.press("Space")
    expect(toggle).not_to_be_checked()
    expect(inline).not_to_be_checked()
    expect(trigger).to_have_accessible_description("任务引擎已关闭")
    expect(admet).to_have_attribute("aria-pressed", "true")
    assert page.locator("iframe.utility-recognition-frame:visible").count() == 0
    page.screenshot(path=EVIDENCE / "recognition-power-in-admet-1280.png")

    companion["power"] = {"phase": "ready", "enabled": True}
    expect(recognition).to_contain_text("已开启", timeout=12000)
    expect(trigger).to_have_accessible_description("1 个后端已开启")
    companion.clear()
    companion.update(available=False, port=8940)
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
    # Opening the workbench rechecks its connection before moving focus.
    page.set_viewport_size({"width": 1280, "height": 800})
    trigger.click()
    recognition = module.locator('[data-engine="decimer"]')
    expect(recognition).to_contain_text("工作台未连接", timeout=12000)
    expect(recognition.get_by_role("switch")).to_be_disabled()
    recognition.get_by_role("button", name="打开识别工作台").press("Enter")
    expect(module).to_have_count(0)
    expect(page.get_by_role("button", name="图片识别与编辑")).to_have_attribute(
        "aria-pressed", "true"
    )
    expect(page.get_by_role("button", name="重新连接")).to_be_focused()
    expect(page.get_by_text("图片识别工作台尚未打开")).to_be_visible()
    local_recognition = page.locator(".utility-editor-tools").get_by_role("switch", name="DECIMER")
    expect(local_recognition).to_be_visible()
    expect(local_recognition).to_be_disabled()
    expect(local_recognition).not_to_be_checked()
    expect(local_recognition).to_have_accessible_description("工作台未连接")
    page.screenshot(path=EVIDENCE / "recognition-power-offline-1280.png")

    previous_loads = len(companion_loads)
    page.get_by_role("button", name="分子性质", exact=True).click()
    companion.update(available=True, idle_power=True, power={"phase": "stopped", "enabled": False})
    trigger.click()
    expect(recognition).to_contain_text("已关闭", timeout=12000)
    recognition.get_by_role("button", name="打开识别工作台").press("Enter")
    frame = page.locator("iframe.utility-recognition-frame")
    expect(frame).to_be_focused()
    switch = page.frame_locator("iframe.utility-recognition-frame").get_by_role("switch")
    expect(switch).to_be_visible()
    expect(switch).not_to_be_checked()
    expect(local_recognition).to_have_count(0)
    page.get_by_role("button", name="分子性质", exact=True).click()
    trigger.click()
    recognition.get_by_role("button", name="打开识别工作台").press("Enter")
    expect(frame).to_be_focused()
    assert len(companion_loads) == previous_loads + 1


def verify_desktop_module_power(page, base, groups):
    toolbar = page.locator(".studio-topbar")
    inline = toolbar.get_by_role("group", name="本模块后端开关", exact=True)
    local_trigger, local_panel = module_power(page)
    for index, (module, engines) in enumerate(groups.items()):
        width = 1280 if index % 2 == 0 else 1600
        page.set_viewport_size({"width": width, "height": 800})
        page.goto(f"{base}/#view=results&module={module}")
        duplicate = page.locator(".task-history-heading [data-backend-placement=module]")
        expect(duplicate).to_have_count(0)
        if len(engines) == 1:
            switch = inline.get_by_role("switch")
            expect(switch).to_be_visible()
            expect(switch).not_to_be_checked()
            assert inline.locator("[data-engine]").get_attribute("data-engine") in engines
            bounds = switch.bounding_box()
        else:
            expect(local_trigger).to_have_accessible_description("任务引擎已关闭")
            expect(local_panel).to_have_count(0)
            local_trigger.press("Space")
            expected = engines | ({"native-compute"} if "harness" in engines else set())
            expect(local_panel.get_by_role("switch")).to_have_count(len(expected))
            assert set(local_panel.locator("[data-engine]").evaluate_all(
                "(rows) => rows.map((row) => row.dataset.engine)"
            )) == expected
            for switch in local_panel.get_by_role("switch").all():
                expect(switch).not_to_be_checked()
            bounds = local_panel.bounding_box()
            if module in {"binding", "simulations"}:
                page.screenshot(path=EVIDENCE / f"{module}-power-{width}.png")
            local_panel.get_by_role("button", name="关闭后端面板").press("Escape")
            expect(local_panel).to_have_count(0)
            expect(local_trigger).to_be_focused()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert bounds and bounds["x"] >= 0
        assert bounds["x"] + bounds["width"] <= width and bounds["y"] < 280
        nav = page.get_by_role("navigation", name="模块工作区")
        nav.get_by_role("button", name="新建任务", exact=True).click()
        current = toolbar.locator(controls(page, zh=True)).get_by_role("switch")
        expect(inline).to_have_count(0)
        expect(current).to_be_visible()
        expect(current).not_to_be_checked()
        expect(local_trigger).to_be_visible()
        expect(local_trigger).to_have_accessible_description("任务引擎已关闭")


def verify_first_module_click_during_status_read(context, base, module, width, inline=None):
    page = context.new_page()
    try:
        page.set_viewport_size({"width": width, "height": 800})
        status_path = "**/api/runtime-controls?include_native=false"
        pending = []
        page.route(status_path, lambda route: pending.append(route), times=1)
        with page.expect_request(status_path):
            page.goto(f"{base}/#view=results&module={module}", wait_until="domcontentloaded")
        trigger, panel = module_power(page)
        expect(trigger).to_have_accessible_description("正在读取…")
        bounds = trigger.bounding_box()
        assert bounds
        page.mouse.move(bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2)
        page.mouse.down()
        pending[0].continue_()
        expect(trigger).to_have_accessible_description("任务引擎已关闭")
        if inline:
            switch = page.locator(".studio-topbar").get_by_role(
                "group", name="本模块后端开关"
            ).locator(f'[data-engine="{inline}"]').get_by_role("switch")
            expect(switch).not_to_be_checked()
        page.mouse.up()
        expect(panel).to_be_visible()
        panel.get_by_role("button", name="关闭后端面板").press("Escape")
        expect(trigger).to_be_focused()
    finally:
        page.close()


def verify_inline_switch_lifecycle(page, base):
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(f"{base}/#view=results&module=del")
    toolbar = page.locator(".studio-topbar")
    inline = toolbar.get_by_role("group", name="本模块后端开关").get_by_role("switch")
    trigger, panel = module_power(page)
    menu_switch = panel.locator('[data-engine="deli"]').get_by_role("switch")
    nav = page.get_by_role("navigation", name="模块工作区")
    root = f"{base}/api/runtime-controls/deli"
    expect(inline).to_be_enabled()
    expect(inline).not_to_be_checked()
    trigger.click()
    panel.get_by_role("button", name="查看全部后端", exact=True).click()
    all_engines = page.get_by_role("region", name="后端启停", exact=True)
    expect(all_engines.locator('[data-engine="deli"]').get_by_role("switch")).not_to_be_checked()
    expect(all_engines.locator('[data-engine="decimer"]').get_by_role("switch")).to_be_visible()
    trigger.press("Escape")
    expect(trigger).to_be_focused()
    with page.expect_response(f"{root}/start") as started:
        inline.press("Space")
    assert started.value.ok and started.value.json() == {"enabled": True}
    expect(inline).to_be_checked()
    page.set_viewport_size({"width": 390, "height": 775})
    trigger.click()
    expect(menu_switch).to_be_checked()
    page.set_viewport_size({"width": 1280, "height": 800})
    trigger.press("Escape")
    expect(trigger).to_be_focused()
    expect(inline).to_be_visible()
    nav.get_by_role("button", name="新建任务", exact=True).click()
    child = controls(page, zh=True).and_(page.locator('[data-capability="del.analyze"]'))
    expect(child.get_by_role("switch")).to_be_checked()
    page.set_viewport_size({"width": 1280, "height": 800})
    expect(inline).to_have_count(0)
    with page.expect_response(f"{root}/stop") as stopped:
        child.get_by_role("switch").click()
    assert stopped.value.ok and stopped.value.json() == {"enabled": False}
    expect(child.get_by_role("switch")).not_to_be_checked()
    nav.get_by_role("button", name="任务结果", exact=True).click()
    expect(inline).not_to_be_checked()


def verify_result_detail(page, base, job_id):
    page.set_viewport_size({"width": 1450, "height": 950})
    page.goto(f"{base}/#task={job_id}")
    heading = page.get_by_role("heading", name="Backend control history fixture", exact=True)
    expect(heading).to_be_visible()
    trigger, module = module_power(page)
    trigger.click()
    expect(module.locator("[data-engine]").first).to_have_attribute("data-engine", "chemistry")
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
    launcher = "server_tests.test_module_backend_switch_browser"
    with (
        platform(state_dir, EVIDENCE / "server.log", entrypoint=launcher) as base,
        sync_playwright() as driver,
    ):
        chromium = driver.chromium.launch(channel="chrome")
        context = chromium.new_context(viewport={"width": 1450, "height": 950})
        page = context.new_page()
        companion = {
            "available": True,
            "port": 8940,
            "idle_power": True,
            "power": {"phase": "stopped", "enabled": False},
        }
        companion_loads = []
        page.route(
            "http://127.0.0.1:8940/**",
            lambda route: route.fulfill(
                content_type="text/html",
                body='<button role="switch" aria-checked="false">Recognition</button>',
            ),
        )
        def recognition_state(route):
            if route.request.method == "POST":
                assert route.request.headers["x-workbench-csrf"]
                enabled = route.request.url.endswith("/start")
                companion["power"] = {
                    "phase": "ready" if enabled else "stopped", "enabled": enabled,
                }
                route.fulfill(json=companion)
            else:
                route.fulfill(
                    json=companion if "include_power=true" in route.request.url else
                    {"available": companion["available"], "port": 8940}
                )

        page.route("**/api/utilities/recognition**", recognition_state)
        def record_companion_load(frame):
            if frame.url.startswith("http://127.0.0.1:8940/"):
                companion_loads.append(frame.url)

        page.on("framenavigated", record_companion_load)
        page.add_init_script("localStorage.setItem('opendde-workbench.language', 'zh')")
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        state = page.request.get(base + "/api/runtime-controls").json()
        assert all(not entry["enabled"] and not entry["active"] for entry in state["engines"])
        posts = []

        def record(request):
            if request.method == "POST" and request.url.startswith(base + "/api/"):
                posts.append(request.url.removeprefix(base))

        context.on("request", record)
        checked = verify_catalogue(page, base, state)
        verify_narrow_compute_entry(page, base)
        verify_composite_tools(page, base)
        modules = verify_modules(page, base)
        verify_desktop_module_power(page, base, modules)
        verify_first_module_click_during_status_read(
            context, base, "proximity", 1440, "deepternary"
        )
        verify_first_module_click_during_status_read(context, base, "simulations", 1180)
        verify_result_detail(page, base, fixture.id)
        verify_setup_entry(page, base)
        assert posts == []
        verify_shared_power(page, base)
        verify_inline_switch_lifecycle(page, base)
        verify_utilities(page, base, companion, companion_loads)
        verify_desktop_task_power_header(context, base)
        after = page.request.get(base + "/api/runtime-controls").json()
        assert all(not entry["enabled"] and not entry["active"] for entry in after["engines"])
        assert page.request.get(base + "/api/jobs").json() == before
        assert posts == [
            "/api/runtime-controls/discovery/start",
            "/api/runtime-controls/discovery/stop",
            "/api/runtime-controls/deli/start",
            "/api/runtime-controls/deli/stop",
            "/api/utilities/recognition/start",
            "/api/utilities/recognition/stop",
        ]
        (EVIDENCE / "coverage.json").write_text(
            json.dumps({
                "task_forms": checked,
                "modules": list(modules),
                "result_toolbar_modules": list(modules),
                "posts": posts,
            }, indent=2),
            encoding="utf-8",
        )
        chromium.close()


if __name__ == "__main__":
    # Stub only the native installation probe. The real platform owns power,
    # request authentication, queue admission, and state on every route.
    from opendde_workbench import backend_router
    from opendde_workbench.__main__ import main
    from opendde_workbench.integrations.runtime import readiness

    async def fixture_readiness(settings, identifier):
        if identifier == "deli":
            return {"ready": True}
        return await readiness(settings, identifier)

    backend_router.scientific_readiness = fixture_readiness
    main()
