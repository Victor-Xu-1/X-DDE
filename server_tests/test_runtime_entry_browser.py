"""Keep installation and runtime navigation linked to the real backend switch."""

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


def test_runtime_backend_link_restores_local_switch_without_starting(tmp_path):
    with (
        platform(tmp_path / "state", tmp_path / "platform.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        writes = []

        def record(request):
            if request.url.startswith(base + "/api/") and request.method != "GET":
                writes.append(request.url)

        page.on("request", record)
        runtime_url = base + "/#view=deployment&tab=runtime"
        for url in (base + "/#view=new&tool=resources", runtime_url):
            page.goto(url)
            runtime = page.get_by_role("button", name="Runtime", exact=True)
            components = page.get_by_role("button", name="Components", exact=True)
            switch = page.locator('.runtime-table-power [data-engine="opendde"]').get_by_role(
                "switch"
            )
            expect(runtime).to_have_attribute("aria-pressed", "true")
            expect(switch).to_be_visible()
            expect(switch).not_to_be_checked()
            components.click()
            expect(page).to_have_url(base + "/#view=deployment")
            expect(components).to_have_attribute("aria-pressed", "true")
            expect(switch).to_have_count(0)
            runtime.click()
            expect(page).to_have_url(runtime_url)
            expect(switch).to_be_visible()
            page.go_back()
            expect(components).to_have_attribute("aria-pressed", "true")
            expect(switch).to_have_count(0)
            page.go_forward()
            expect(runtime).to_have_attribute("aria-pressed", "true")
            expect(switch).not_to_be_checked()
            page.reload()
            expect(switch).to_be_visible()
            expect(switch).not_to_be_checked()
        assert writes == []
        switches = page.locator(".runtime-table-power").get_by_role("switch")
        power = page.request.get(base + "/api/runtime-controls?include_native=false").json()
        expect(switches).to_have_count(len(power["engines"]))
        assert all(not switch.is_checked() for switch in switches.all())

        discovery = page.locator('.runtime-table-power [data-engine="discovery"]').get_by_role(
            "switch"
        )
        with page.expect_response(base + "/api/runtime-controls/discovery/start") as started:
            discovery.click()
        assert started.value.ok and started.value.json() == {"enabled": True}
        child_url = base + "/#view=new&tool=discovery.target"
        page.goto(child_url)
        child = page.locator('[data-capability="discovery.target"]').get_by_role("switch")
        expect(child).to_be_checked()
        with page.expect_response(base + "/api/runtime-controls/discovery/stop") as stopped:
            child.click()
        assert stopped.value.ok and stopped.value.json() == {"enabled": False}
        page.goto(runtime_url)
        expect(discovery).not_to_be_checked()
        assert writes == [
            base + "/api/runtime-controls/discovery/start",
            base + "/api/runtime-controls/discovery/stop",
        ]
        engines = page.request.get(base + "/api/runtime-controls?include_native=false").json()
        assert all(not row["enabled"] and not row["active"] for row in engines["engines"])
        browser.close()


@pytest.mark.parametrize("language", ["en", "zh"])
def test_short_runtime_catalogue_fits_and_filters_without_power_requests(tmp_path, language):
    zh = language == "zh"
    with (
        platform(tmp_path / "state", tmp_path / "platform.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1024, "height": 600})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.url.startswith(base + "/api/") and request.method != "GET" else None)
        page.goto(base + "/#view=deployment&tab=runtime")
        region = page.get_by_role(
            "region", name="集成环境" if zh else "Integrated environments",
        )
        rows = region.locator("tbody tr")
        switches = region.get_by_role("switch")
        power = page.request.get(base + "/api/runtime-controls?include_native=false").json()
        expect(switches).to_have_count(len(power["engines"]))
        assert all(not switch.is_checked() for switch in switches.all())
        pane = region.locator(".table-scroll")
        geometry = pane.evaluate("""element => {
            const bounds = element.getBoundingClientRect();
            const usableBottom = Math.min(innerHeight, bounds.bottom);
            const rows = Array.from(element.querySelectorAll('tbody tr'));
            return {
              top: bounds.top,
              bottom: bounds.bottom,
              widthFits: element.scrollWidth <= element.clientWidth + 1,
              visibleRows: rows.filter(
                row => row.getBoundingClientRect().bottom <= usableBottom
              ).length,
              rowFont: getComputedStyle(rows[0].querySelector('th')).fontFamily,
            };
        }""")
        assert geometry["widthFits"] and geometry["top"] <= 300, geometry
        assert geometry["bottom"] <= 600 and geometry["visibleRows"] >= 4, geometry
        assert geometry["rowFont"] != "monospace"
        controls = page.locator(".runtime-summary")
        assert controls.evaluate("""summary => {
            const children = Array.from(summary.children, e => e.getBoundingClientRect());
            return Math.max(...children.map(b => b.top)) < Math.min(...children.map(b => b.bottom));
        }""")

        search = region.get_by_role(
            "searchbox", name="搜索集成环境" if zh else "Search integrated environments",
        )
        initial_count = rows.count()
        search.fill("口袋寻找" if zh else "  p2rank  ")
        expect(rows).to_have_count(1)
        expect(rows.first.get_by_role("rowheader")).to_contain_text("P2Rank")
        expect(rows.first.get_by_role("switch")).not_to_be_checked()
        search.fill("no-such-environment")
        expect(region.get_by_role("status")).to_have_text(
            "没有匹配的集成环境。" if zh else "No matching environments.",
        )
        expect(region.get_by_role("table")).to_have_count(0)
        search.fill("")
        expect(rows).to_have_count(initial_count)
        page.get_by_role(
            "button", name="管理集成环境" if zh else "Manage integrated environments",
        ).click()
        expect(page).to_have_url(base + "/#view=deployment")
        assert writes == []
        browser.close()
