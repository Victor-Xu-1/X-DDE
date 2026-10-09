"""Controlled completed-result display contract; never a native FEP accuracy claim.

The real retained TYK2 structures/network are unchanged. Only the result API in
the isolated Chromium page receives explicitly controlled diagnostic values.
No new scientific task, charge assignment, simulation or model call is made.
"""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_svg


def controlled_leg(delta):
    return {
        "delta_g_kcal_mol": delta,
        "uncertainty_kcal_mol": 0.2,
        "repeat_spread_kcal_mol": None,
        "individual": [{"delta_g": delta, "mbar_error": 0.2}],
        "overlap": [[[0.9, 0.1], [0.1, 0.9]]],
        "convergence": [
            {
                "fractions": [0.25, 0.5, 0.75, 1],
                "forward": [delta - 0.1, delta + 0.1, delta, delta],
                "reverse": [delta + 0.1, delta, delta - 0.1, delta],
                "forward_error": [0.4, 0.3, 0.25, 0.2],
                "reverse_error": [0.4, 0.3, 0.25, 0.2],
            }
        ],
    }


@pytest.mark.parametrize("language", ["en", "zh"])
def test_completed_fep_diagnostics_display_values_and_downloads(language):
    source = Path("outputs/native-simulations/openfe.rbfe")
    identifier = (source / "job-id.txt").read_text().strip()
    report = json.loads((source / "output/result.json").read_text())
    report["free_energy"]["stage"] = "calculate"
    report["free_energy"]["method"] = "Controlled UI contract — not a computed FEP result"
    edge = report["free_energy"]["edges"][0]
    edge.update(
        {
            "delta_delta_g_kcal_mol": -1.8,
            "uncertainty_kcal_mol": 0.35,
            "minimum_adjacent_overlap": 0.1,
            "quality": None,
            "legs": {"complex": controlled_leg(-2.3), "solvent": controlled_leg(-0.5)},
        }
    )
    evidence = Path("outputs/simulation-diagnostics") / language
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "evidence-scope.json").write_text(
        json.dumps(
            {
                "source": "controlled API display contract with retained native TYK2 structures",
                "native_fep_execution": False,
                "scientific_acceptance": False,
                "expected_diagnostics": edge,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    with platform(source / "state", evidence / "browser.log") as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, submitted = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submitted.append(request.url)
                if request.method == "POST" and "/api/" in request.url
                else None
            ),
        )
        page.route(
            "**/api/jobs/" + identifier + "/result", lambda route: route.fulfill(json=report)
        )
        page.goto(base + "/#task=" + identifier)
        root = page.get_by_test_id("free-energy-results")
        expect(root).to_be_visible(timeout=30000)
        root.get_by_role(
            "tab", name="Sampling and convergence" if language == "en" else "采样与收敛"
        ).click()
        cycle = root.get_by_role(
            "application",
            name="Thermodynamic cycle" if language == "en" else "热力学循环",
            exact=True,
        )
        expect(cycle).to_have_attribute("aria-busy", "false", timeout=30000)
        assert cycle.evaluate("el => el.data[0].x") == [-2.3, -0.5, -1.8]
        assert cycle.evaluate("el => el.data[0].error_x.array") == [0.2, 0.2, 0.35]
        png = export_figure(
            page,
            cycle.locator("..").get_by_role(
                "button", name="Export figure ↓" if language == "en" else "文献图导出 ↓"
            ),
            evidence,
            "controlled-cycle",
            language,
            "SVG",
        )
        inspect_svg(png, "kcal/mol")
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            page.wait_for_function("() => document.documentElement.scrollWidth <= innerWidth + 1")
            # Full-page captures start at the document top, keeping sticky chrome
            # in its actual top position rather than a scrolled capture offset.
            page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
            page.screenshot(path=str(evidence / f"controlled-cycle-{width}.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 1000})
        root.get_by_role(
            "combobox", name="Thermodynamic leg" if language == "en" else "环境"
        ).select_option("solvent")
        root.get_by_role(
            "tab", name="Overlap" if language == "en" else "重叠热图", exact=True
        ).click()
        overlap = root.get_by_role(
            "application", name="Sampling overlap" if language == "en" else "采样重叠", exact=True
        )
        expect(overlap).to_have_attribute("aria-busy", "false", timeout=30000)
        assert overlap.evaluate("el => el.data[0].z") == [[0.9, 0.1], [0.1, 0.9]]
        page.screenshot(path=str(evidence / "controlled-overlap.png"), full_page=True)
        root.get_by_role(
            "tab", name="Convergence" if language == "en" else "收敛曲线", exact=True
        ).click()
        convergence = root.get_by_role(
            "application",
            name="Forward and reverse estimates" if language == "en" else "前向与反向估计",
            exact=True,
        )
        expect(convergence).to_have_attribute("aria-busy", "false", timeout=30000)
        assert convergence.evaluate("el => el.data[0].y") == [-0.6, -0.4, -0.5, -0.5]
        assert convergence.evaluate("el => el.data[0].error_y.array") == [0.4, 0.3, 0.25, 0.2]
        page.screenshot(path=str(evidence / "controlled-convergence.png"), full_page=True)
        root.get_by_role(
            "tab", name="Repeats" if language == "en" else "重复结果", exact=True
        ).click()
        table = root.get_by_role(
            "table",
            name="Independent estimates for selected leg"
            if language == "en"
            else "当前环境的独立估计",
        )
        expect(table).to_contain_text("-0.5")
        expect(table).to_contain_text("0.2")
        with page.expect_download() as downloaded:
            root.get_by_role(
                "tabpanel", name="Repeats" if language == "en" else "重复结果"
            ).get_by_role(
                "button", name="Export filtered rows" if language == "en" else "导出筛选结果"
            ).click()
        downloaded.value.save_as(evidence / "controlled-solvent-repeats.csv")
        assert "-0.5" in (evidence / "controlled-solvent-repeats.csv").read_text()
        assert not errors and not submitted
        browser.close()
