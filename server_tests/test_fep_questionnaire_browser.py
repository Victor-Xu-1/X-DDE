"""Native FEP input selection and bounded recovery; no FEP/MD calculation or invented result."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench import __version__
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_native_fep_file_deadline_retry_paging_and_exact_review(tmp_path, language, width):
    evidence = Path("outputs/fep-questionnaire") / language
    evidence.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    state.mkdir()
    # Reuse only the already verified graphical component in isolated test state.
    (state / "deployment.json").write_bytes(
        (Settings.from_env().state_dir / "deployment.json").read_bytes()
    )
    store = Store(state / "jobs.sqlite3")
    receptor = tmp_path / "STAT6-receptor.pdb"
    receptor.write_bytes(verified_input("stat6_receptor"))
    series = tmp_path / "STAT6-selection-behaviour.sdf"
    # Thirteen unchanged copies test pagination/record identity, NOT congeneric chemistry.
    source = verified_input("study_ligand")
    series.write_bytes(source * 13)
    title = source.decode().splitlines()[0]
    zh = language == "zh"
    with platform(state, evidence / "browser.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions, held = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST" and request.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base)
        open_navigation(page, language).get_by_role(
            "button", name="动力学与 FEP" if zh else "Dynamics and FEP", exact=True
        ).click()
        page.get_by_role("combobox", name="研究任务" if zh else "Research task").select_option(
            "openfe.rbfe"
        )
        module = page.get_by_role(
            "region", name="FEP 结合自由能" if zh else "FEP binding free energy", exact=True
        )
        expect(
            page.get_by_role("radio", name="上传新文件" if zh else "Upload a new file").first
        ).to_be_checked()
        page.get_by_role(
            "button", name="使用此模板" if zh else "Use this template", exact=True
        ).click()
        expect(
            page.get_by_role("button", name="新建空白任务" if zh else "New blank task", exact=True)
        ).to_be_visible()
        page.get_by_role("radio", name="上传新文件" if zh else "Upload a new file").first.check()
        page.get_by_label(
            "上传 蛋白结构" if zh else "Upload Protein structure", exact=True
        ).set_input_files(receptor)
        route_pattern = "**/api/assets/*"
        page.route(
            route_pattern,
            lambda route: (
                route.continue_() if route.request.url.endswith("/metadata") else held.append(route)
            ),
        )
        page.get_by_label(
            "上传 整组 SDF 分子文件" if zh else "Upload Whole SDF molecular library", exact=True
        ).set_input_files(series)
        next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_enabled()
        selected = next(
            asset
            for asset in page.request.get(base + "/api/assets").json()
            if asset["name"] == series.name
        )
        url = base + "/api/assets/" + selected["id"]
        next_button.click()
        expect(
            page.get_by_role("status").filter(
                has_text="正在读取分子系列" if zh else "Reading the molecular series"
            )
        ).to_be_visible()
        expect(next_button).to_be_disabled()
        expect(
            page.get_by_role("alert").filter(
                has_text="暂时无法读取分子" if zh else "could not be read"
            )
        ).to_be_visible(timeout=20000)
        expect(next_button).to_be_disabled()
        assert len(held) == 1
        page.screenshot(path=evidence / "bounded-read.png", full_page=True)
        page.unroute(route_pattern)
        # The product deadline has already cancelled the held request. Do not
        # handle that completed route a second time; the retry is a new read.
        page.get_by_role("button", name="重新读取" if zh else "Try again", exact=True).click()
        selection = page.get_by_role(
            "region", name="选择 FEP 分子" if zh else "Select FEP molecules"
        )
        expect(module.locator(".template-step-help")).to_contain_text(
            "原始序号" if zh else "original record numbers"
        )

        def inspect_drawings():
            # Compact molecular drawings intentionally load as they enter the
            # viewport. Inspect every card without disabling that product behavior.
            for card in selection.locator(".simulation-ligand-grid > label").all():
                card.scroll_into_view_if_needed()
                expect(card.locator(".molecule-image")).to_have_attribute(
                    "data-drawing-state", "ready", timeout=60000
                )

        expect(selection.get_by_role("checkbox")).to_have_count(12)
        inspect_drawings()
        first_card = (
            selection.get_by_role("checkbox", name=f"{title} · 1", exact=True)
            .locator("..")
            .locator("..")
        )
        expect(
            first_card.get_by_text("原始序号 1" if zh else "Record 1", exact=True)
        ).to_be_visible()
        selection.get_by_role("checkbox", name=f"{title} · 1", exact=True).check()
        selection.get_by_role("button", name="下一页" if zh else "Next page", exact=True).click()
        expect(selection.get_by_role("checkbox")).to_have_count(1)
        expect(
            selection.get_by_text("原始序号 13" if zh else "Record 13", exact=True)
        ).to_be_visible()
        selection.get_by_role("checkbox", name=f"{title} · 13", exact=True).check()
        search = selection.get_by_role("searchbox")
        search.fill("13")
        expect(selection.get_by_role("checkbox")).to_have_count(1)
        expect(selection.get_by_role("checkbox", name=f"{title} · 13", exact=True)).to_be_checked()
        search.fill("")
        expect(selection.get_by_role("checkbox", name=f"{title} · 1", exact=True)).to_be_checked()
        expect(next_button).to_be_enabled()
        inspect_drawings()
        active = module.locator(".questionnaire > fieldset:not([hidden])")
        expect(active).to_have_css("transform", "none")
        actions = module.locator(".questionnaire-actions")
        expect(actions).to_have_css("position", "static")
        geometry = module.evaluate("""node => {
            const content = node.querySelector('.simulation-molecular-selection')
                .getBoundingClientRect();
            const actions = node.querySelector('.questionnaire-actions').getBoundingClientRect();
            return {contentBottom:content.bottom, actionsTop:actions.top};
        }""")
        assert geometry["actionsTop"] >= geometry["contentBottom"] - 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=evidence / "selected-records.png", full_page=True)
        next_button.click()
        next_button.click()
        review_inputs = module.get_by_role(
            "region", name="所选研究材料" if zh else "Selected research inputs"
        )
        expect(review_inputs.get_by_text(series.name, exact=True)).to_be_visible()
        molecules = module.get_by_role("region", name="递交的分子" if zh else "Molecules to submit")
        rows = molecules.get_by_role("listitem")
        expect(rows).to_have_count(2)
        assert rows.evaluate_all("nodes => nodes.map(n => Number(n.dataset.originalRecord))") == [
            0,
            12,
        ]
        for row, record in zip(rows.all(), (1, 13), strict=True):
            row.scroll_into_view_if_needed()
            expect(
                row.get_by_text(f"原始序号 {record}" if zh else f"Record {record}", exact=True)
            ).to_be_visible()
            expect(row.locator(".molecule-image")).to_have_attribute(
                "data-drawing-state", "ready", timeout=60000
            )
        expect(module.locator(".template-step-help")).to_contain_text(
            "二维结构" if zh else "2D structure"
        )
        expect(
            page.get_by_text(
                "变化网络规划 · 不进行模拟" if zh else "Network planning · No simulation",
                exact=True,
            )
        ).to_be_visible()
        expect(
            page.get_by_role(
                "button", name="创建分子变化网络" if zh else "Plan molecular network", exact=True
            )
        ).to_be_disabled()
        page.screenshot(path=evidence / "review.png", full_page=True)
        downloaded = page.request.get(url).body()
        assert downloaded == series.read_bytes()
        assert not errors and not submissions and not store.list_jobs()
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "version": __version__,
                    "language": language,
                    "width": width,
                    "selected_original_records": [0, 12],
                    "max_rendered_molecules": 12,
                    "read_deadline_and_retry": True,
                    "native_ketcher": True,
                    "nonoverlapping_actions": True,
                    "reviewed_original_records": [0, 12],
                    "native_review_drawings": True,
                    "simulation_specific_step_hints": True,
                    "source_sha256": hashlib.sha256(downloaded).hexdigest(),
                    "scientific_jobs": 0,
                    "scientific_acceptance": False,
                },
                indent=2,
            )
        )
        browser.close()
