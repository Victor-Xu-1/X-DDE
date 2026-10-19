"""Read and interact with the actual persisted native comparison in Chromium, bilingual."""

import json

from browser_platform import platform
from playwright.sync_api import expect, sync_playwright


def verify_browser(state, job_id, result, evidence):
    with (
        platform(state, evidence / "browser-platform.log") as base,
        sync_playwright() as playwright,
    ):
        browser = playwright.chromium.launch()
        try:
            for language in ("en", "zh"):
                zh = language == "zh"
                context = browser.new_context(viewport={"width": 1440, "height": 1100})
                page = context.new_page()
                page.add_init_script(
                    f"localStorage.setItem('opendde-workbench.language', '{language}')"
                )
                errors = []
                page.on("pageerror", lambda error, retained=errors: retained.append(str(error)))
                page.goto(base + "/#task=" + job_id)
                panel = page.get_by_role(
                    "region",
                    name="蛋白结构比较结果" if zh else "Protein structure comparison results",
                    exact=True,
                )
                expect(panel).to_be_visible(timeout=45000)
                capture = panel.get_by_role(
                    "button",
                    name="生成三维视图图片" if zh else "Capture 3D view",
                    exact=True,
                )
                expect(capture).to_be_enabled(timeout=45000)
                expected = format(result["geometry"]["partner_rmsd_angstrom"], ".3f") + " Å"
                expect(panel.locator(".comparison-result-metrics")).to_contain_text(expected)
                table = panel.get_by_role(
                    "table", name="逐残基比较" if zh else "Per-residue comparison", exact=True
                )
                row = table.get_by_role("row").nth(1)
                row.click()
                expect(panel.locator("output")).to_be_visible()
                row.press("Enter")
                expect(row).to_have_attribute("aria-selected", "true")
                for name, title in (
                    (
                        "界面" if zh else "Interfaces",
                        "原生界面指标" if zh else "Native interface metrics",
                    ),
                    (
                        "覆盖率" if zh else "Coverage",
                        "链对应与覆盖率" if zh else "Chain correspondence and coverage",
                    ),
                ):
                    panel.get_by_role("button", name=name, exact=True).click()
                    expect(panel.get_by_role("table", name=title, exact=True)).to_be_visible()
                panel.get_by_role(
                    "button", name="结构来源" if zh else "Sources", exact=True
                ).click()
                expect(panel.get_by_role("link", name="reference.cif", exact=True)).to_be_visible()
                expect(panel.get_by_role("link", name="moving.cif", exact=True)).to_be_visible()
                for mode in (
                    "已对齐比较结构" if zh else "Aligned comparison",
                    "已对齐叠合" if zh else "Aligned overlay",
                ):
                    control = panel.get_by_role("button", name=mode, exact=True)
                    control.click()
                    expect(control).to_have_attribute("aria-pressed", "true")
                    expect(capture).to_be_enabled(timeout=45000)
                with page.expect_download() as download:
                    panel.get_by_role(
                        "link", name="完整位移 CSV" if zh else "Full displacement CSV", exact=True
                    ).click()
                downloaded = evidence / (language + "-downloaded-displacements.csv")
                download.value.save_as(downloaded)
                assert (
                    downloaded.read_text(encoding="utf-8")
                    .splitlines()[0]
                    .startswith("role,reference_chain,")
                )
                panel.get_by_role(
                    "button", name="残基位移" if zh else "Residue displacement", exact=True
                ).click()
                expect(panel.locator(".research-plot .js-plotly-plot")).to_be_visible(timeout=45000)
                page.screenshot(
                    path=str(evidence / (language + "-native-comparison.png")), full_page=True
                )
                assert not errors, errors
                context.close()
        finally:
            browser.close()
    (evidence / "browser-controls.json").write_text(
        json.dumps(
            {
                "languages": ["en", "zh"],
                "native_job": job_id,
                "verified": [
                    "same_frame_view_switch",
                    "residue_selection",
                    "interface_metrics",
                    "coverage",
                    "source_downloads",
                    "interactive_plot",
                ],
                "research_example_acceptance": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
