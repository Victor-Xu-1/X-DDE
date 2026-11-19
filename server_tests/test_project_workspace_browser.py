"""Desktop project navigation and actual form dismissal in an isolated workbench."""

from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/project-workspace")


def open_projects(page, zh):
    navigation = page.get_by_role("navigation", name="主导航" if zh else "Main navigation")
    navigation.get_by_role(
        "button", name="研究空间" if zh else "Research workspace", exact=True
    ).click()
    page.get_by_role("button", name="项目" if zh else "Projects", exact=True).click()
    return page.locator(".project-workspace")


def open_project_dialog(page, panel, zh):
    panel.get_by_role("button", name="新建项目" if zh else "New project", exact=True).click()
    dialog = page.get_by_role("dialog", name="新建项目" if zh else "New project", exact=True)
    name = dialog.get_by_role("textbox", name="项目名称" if zh else "Project name", exact=True)
    expect(name).to_be_focused()
    return dialog, name


def create_project(page, panel, label, zh):
    dialog, name = open_project_dialog(page, panel, zh)
    name.fill(label)
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and urlsplit(response.url).path == "/api/projects"
    ) as created:
        dialog.get_by_role(
            "button", name="创建项目" if zh else "Create project", exact=True
        ).click()
    assert created.value.status == 201
    expect(dialog).to_have_count(0)
    expect(page.get_by_role("group", name="项目筛选" if zh else "Project filter")).to_contain_text(
        label
    )


@pytest.mark.parametrize(("language", "width", "height"), [("en", 1280, 720), ("zh", 1600, 900)])
def test_desktop_projects_focus_and_filter(tmp_path, language, width, height):
    zh = language == "zh"
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(tmp_path / "state", evidence / "service.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        writes = []

        def record_write(request):
            if request.method not in {"GET", "HEAD"}:
                writes.append(urlsplit(request.url).path)

        page.on("request", record_write)
        page.goto(base)
        panel = open_projects(page, zh)
        expect(panel.locator(".project-empty")).to_be_visible()
        expect(panel.get_by_role("searchbox")).to_have_count(0)
        shortcut = panel.locator(".project-task-shortcut")
        expect(shortcut).to_be_visible()
        expect(panel.locator(".project-list .project-row")).to_have_count(0)
        page.screenshot(path=evidence / "empty.png")
        opener = panel.get_by_role("button", name="新建项目" if zh else "New project", exact=True)
        dialog, name = open_project_dialog(page, panel, zh)
        submit = dialog.get_by_role("button", name="创建项目" if zh else "Create project")
        expect(submit).to_be_disabled()
        name.fill("Dismissed example")
        page.screenshot(path=evidence / "dialog.png")
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()
        dialog, _ = open_project_dialog(page, panel, zh)
        dialog.get_by_role("button", name="取消" if zh else "Cancel", exact=True).click()
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()
        assert not writes

        create_project(page, panel, "Receptor study", zh)
        panel = open_projects(page, zh)
        create_project(page, panel, "Ligand study", zh)
        panel = open_projects(page, zh)
        search = panel.get_by_role("searchbox")
        rows = panel.locator(".project-row")
        expect(rows).to_have_count(2)
        bounds = rows.first.bounding_box()
        assert bounds and 52 <= bounds["height"] < 64
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        page.screenshot(path=evidence / "populated.png")
        search.fill("receptor")
        expect(rows).to_have_count(1)
        panel.get_by_role("button", name="Receptor study", exact=True).click()
        project_filter = page.get_by_role("group", name="项目筛选" if zh else "Project filter")
        expect(project_filter).to_contain_text("Receptor study")
        panel = open_projects(page, zh)
        expect(panel.get_by_role("button", name="Receptor study", exact=True)).to_have_attribute(
            "aria-current", "true"
        )
        panel.locator(".project-task-shortcut").click()
        expect(project_filter).to_have_count(0)
        assert "module=structures" in page.url
        assert writes == ["/api/projects", "/api/projects"]
        assert {row["name"] for row in page.request.get(base + "/api/projects").json()} == {
            "Receptor study",
            "Ligand study",
        }
        browser.close()
