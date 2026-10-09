"""Installation composition; controlled installed flags are not native execution evidence."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform


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
            page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
            page.goto(base)
            if width < 1024:
                page.get_by_role(
                    "button",
                    name="Open research navigation" if language == "en" else "打开研究导航",
                ).click()
            page.get_by_role(
                "button", name="Settings and help" if language == "en" else "设置与帮助"
            ).click()
            page.get_by_role(
                "menuitem", name="Installation and runtime" if language == "en" else "安装与运行"
            ).click()
            page.get_by_role(
                "button",
                name="Dynamics and binding free energy"
                if language == "en"
                else "动力学与结合自由能",
                exact=True,
            ).click()
            grid = page.locator(".component-grid.is-engine-comparison")
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
                assert all(p["width"] >= 280 for p in positions)
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
