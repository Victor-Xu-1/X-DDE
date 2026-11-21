"""Installation composition; controlled installed flags are not native execution evidence."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.deployment.manager import DeploymentManager
from server_tests.browser_platform import platform


def open_components(page, base, language):
    zh = language == "zh"
    page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
    page.goto(base)
    navigation = page.get_by_role(
        "button", name="打开研究导航" if zh else "Open research navigation"
    )
    settings = page.get_by_role("button", name="设置与帮助" if zh else "Settings and help")
    navigation.or_(settings).first.wait_for()
    if navigation.is_visible():
        navigation.click()
    settings.click()
    page.get_by_role(
        "menuitem", name="安装与运行" if zh else "Installation and runtime"
    ).click()


@pytest.mark.parametrize(("language", "width", "height", "columns"), [
    ("en", 1001, 650, 3),
    ("en", 1024, 600, 3),
    ("zh", 1024, 600, 3),
    ("en", 1080, 650, 3),
    ("en", 1280, 720, 4),
    ("zh", 1600, 900, 5),
])
def test_desktop_catalogue_keeps_first_row_actions_visible(
    tmp_path, language, width, height, columns,
):
    evidence = Path("outputs/component-presentation")
    evidence.mkdir(parents=True, exist_ok=True)
    prefix = f"{language}-{width}-catalogue"
    with platform(tmp_path / "state", evidence / f"{prefix}.log") as base:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": height})
            mutations = []
            page.on("request", lambda request: mutations.append(request.url)
                    if request.method == "POST" else None)
            open_components(page, base, language)
            library = page.locator(".component-library")
            grid = library.locator(":scope > .component-grid")
            cards = grid.get_by_role("article")
            expect(cards.first).to_be_visible()
            location = page.locator(".install-location")
            compute = page.locator(".compute-service-panel")
            location_box, compute_box = location.bounding_box(), compute.bounding_box()
            assert location_box and compute_box
            assert abs(location_box["y"] - compute_box["y"]) <= 1
            assert location_box["x"] + location_box["width"] < compute_box["x"]
            boxes = cards.evaluate_all(
                """nodes => nodes.map(node => {
                    const box = node.getBoundingClientRect().toJSON();
                    const description = node.querySelector("p");
                    const actions = node.querySelector(".component-actions");
                    const next = node.querySelector(".component-size") ?? actions;
                    return {...box, actions: actions.getBoundingClientRect().toJSON(),
                        textFits: description.scrollHeight <= description.clientHeight + 1 &&
                            description.getBoundingClientRect().bottom <=
                            next.getBoundingClientRect().top + 1};
                })"""
            )
            row = [box for box in boxes if abs(box["top"] - boxes[0]["top"]) <= 1]
            assert len(row) == columns
            assert all(box["actions"]["bottom"] <= height for box in row), row
            assert all(0.7 <= box["width"] / box["height"] <= 1.4 for box in row), row
            assert all(box["textFits"] for box in boxes)
            expect(cards.first).to_have_css("border-top-left-radius", "10px")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            selector = location.get_by_role("combobox")
            selector_box = selector.bounding_box()
            assert selector_box and selector_box["width"] >= 0.85 * location_box["width"]
            page.screenshot(path=evidence / f"{prefix}.png")

            original = selector.input_value()
            selector.select_option("custom")
            expect(location.get_by_role("textbox")).to_be_visible()
            selector.select_option(original)
            expect(location.get_by_role("textbox")).to_have_count(0)

            zh = language == "zh"
            groups = library.get_by_role("combobox", name="组件分组" if zh else "Component group")
            expect(groups).to_have_value("all")
            groups.select_option(label="动力学与结合自由能" if zh else "Dynamics and binding free energy")
            expect(cards).to_have_count(3)
            expect(library.get_by_role(
                "button", name="部署推荐组合" if zh else "Install recommended bundle",
            )).to_be_visible()
            selected_box = cards.first.bounding_box()
            assert selected_box and abs(selected_box["width"] - row[0]["width"]) <= 1
            groups.select_option("all")
            expect(cards.first).to_be_visible()
            assert cards.count() > 3
            assert not mutations
            browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
@pytest.mark.parametrize("width", [1440, 768, 390])
def test_visible_engine_comparison_and_installed_controls(tmp_path, language, width):
    evidence = Path("outputs/component-presentation")
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(tmp_path / "state", evidence / f"{language}-{width}.log") as base:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": 1000})
            catalog = page.request.get(base + "/api/deployment").json()
            catalog["packages"] = [
                p for p in catalog["packages"] if p["id"] in {"openmm", "openfe", "gromacs"}
            ]
            assert len(catalog["packages"]) == 3
            catalog["installed"] = {p["id"]: {"version": p["version"]} for p in catalog["packages"]}
            errors, mutations = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: mutations.append(request.url) if request.method == "POST" else None,
            )
            page.route("**/api/deployment", lambda route: route.fulfill(json=catalog))
            open_components(page, base, language)
            page.get_by_role(
                "combobox", name="组件分组" if language == "zh" else "Component group",
            ).select_option(
                label="动力学与结合自由能" if language == "zh" else "Dynamics and binding free energy",
            )
            grid = page.locator(".component-library > .component-grid")
            cards = grid.get_by_role("article")
            expect(cards).to_have_count(3)
            installed = cards.get_by_role(
                "button", name="Installed" if language == "en" else "已安装", exact=True
            )
            expect(installed).to_have_count(3)
            for index in range(3):
                expect(installed.nth(index)).to_be_disabled()
            expect(page.locator(".component-additions")).to_have_count(0)
            positions = cards.evaluate_all(
                "nodes => nodes.map(node => node.getBoundingClientRect().toJSON())"
            )
            if width == 1440:
                assert max(p["y"] for p in positions) - min(p["y"] for p in positions) <= 1
                widths = [p["width"] for p in positions]
                assert min(widths) >= 240 and max(widths) - min(widths) <= 1
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=str(evidence / f"{language}-{width}-engines.png"), full_page=True)
            assert not mutations and not errors
            (evidence / f"{language}-{width}-scope.json").write_text(
                json.dumps(
                    {
                        "controlled_installation_status": True,
                        "original_server_catalog": True,
                        "scientific_calculations": False,
                        "native_execution_evidence": False,
                        "engines_visible": 3,
                    }
                ),
                encoding="utf-8",
            )
            browser.close()


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_old_component_failure_retains_recovery_controls(tmp_path, language, width):
    """Real SQLite history and controls; the isolated fixture never runs an installer."""
    evidence = Path("outputs/component-presentation")
    evidence.mkdir(parents=True, exist_ok=True)
    prefix = f"{language}-{width}-old-failure"
    manager = DeploymentManager(tmp_path / "deployment-fixture")
    store = manager.store
    failed = store.enqueue("ketcher", "install", {})[0]
    message = "Controlled download unavailable; retry is available."
    store.update(failed, state="failed", stage="Installation stopped", error=message)
    for _ in range(100):
        identifier = store.enqueue("molstar", "install", {})[0]
        store.update(identifier, state="succeeded", stage="Controlled terminal record")
    assert not store.config() and manager.task is None

    with platform(tmp_path / "platform-state", evidence / f"{prefix}.log") as base:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": 1000})
            catalog = page.request.get(base + "/api/deployment").json()
            errors, mutations = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))

            def deployment_read(route):
                route.fulfill(json={**catalog, "operations": store.rows()})

            def deployment_control(route):
                request = route.request
                if request.method != "POST":
                    route.continue_()
                    return
                path = request.url.removeprefix(base)
                mutations.append(path)
                allowed = {
                    f"/api/deployment/operations/{failed}/{action}": action
                    for action in ("resume", "pause", "cancel")
                }
                if path not in allowed:
                    route.abort()
                    return
                manager.control(failed, allowed[path])
                route.fulfill(json={"ok": True})

            # GET uses current backend rows, and every POST is intercepted. No request
            # can enqueue an installer on the real platform or execute the fixture queue.
            page.route("**/api/**", deployment_control)
            page.route("**/api/deployment", deployment_read)
            try:
                open_components(page, base, language)
                activity = page.locator(".deployment-progress")
                expect(activity.get_by_role("article")).to_have_count(1)
                expect(activity.get_by_text(message, exact=True)).to_be_visible()
                retry = activity.get_by_role(
                    "button", name="Resume / retry" if language == "en" else "继续 / 重试"
                )
                cancel_name = "Cancel" if language == "en" else "取消"
                expect(retry).to_be_enabled()
                expect(activity.get_by_role("button", name=cancel_name, exact=True)).to_be_enabled()
                activity.scroll_into_view_if_needed()
                page.screenshot(path=str(evidence / f"{prefix}-visible.png"))

                retry.click()
                pause = activity.get_by_role(
                    "button", name="Pause" if language == "en" else "暂停", exact=True
                )
                expect(pause).to_be_enabled()
                assert store.get(failed)["state"] == "queued"
                expect(activity.get_by_text(message, exact=True)).to_have_count(0)
                pause.click()
                expect(retry).to_be_enabled()
                assert store.get(failed)["state"] == "paused"
                activity.get_by_role("button", name=cancel_name, exact=True).click()
                expect(activity).to_have_count(0)
                assert store.get(failed)["state"] == "cancelled"
                assert mutations == [
                    f"/api/deployment/operations/{failed}/{action}"
                    for action in ("resume", "pause", "cancel")
                ]
                assert not errors and not store.config() and manager.task is None
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                page.screenshot(path=str(evidence / f"{prefix}-cancelled.png"))
                (evidence / f"{prefix}-scope.json").write_text(
                    json.dumps(
                        {
                            "real_sqlite_operations": 101,
                            "controlled_deployment_get": True,
                            "original_server_catalog": True,
                            "intercepted_controls": mutations,
                            "fixture_worker_started": False,
                            "scientific_calculations": False,
                            "native_execution_evidence": False,
                        }
                    ),
                    encoding="utf-8",
                )
            except BaseException:
                try:
                    page.screenshot(path=str(evidence / f"{prefix}-failure.png"), timeout=5000)
                except Exception:
                    pass
                raise
            finally:
                browser.close()
