"""Replay the exact Boltz-2/PLIP pair without running either scientific engine."""

from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.test_workspace_fullscreen_browser import restored_workspace as restored_workspace


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_stat6_receptor_review_and_native_contact_frame(restored_workspace, language, width):
    settings, store, pins = restored_workspace
    pin = pins.get("boltz.predict", verify=True)
    assert pin
    job = str(pin.job_id)
    assert job == "1190e938-51af-44a3-9dbc-4aacc77b5821"
    supporting = next(iter(pin.supporting_evidence))
    assert (
        supporting.artifact_sha256["interaction-structure.cif"]
        == (pin.artifact_sha256["structure-003.cif"])
    )
    assert str(supporting.job_id) == "a5773abd-8315-49f7-ab66-7df445c39d45"
    evidence = Path("outputs/prediction-reference-review") / language
    evidence.mkdir(parents=True, exist_ok=True)
    before = [entry.model_dump(mode="json") for entry in store.list_jobs(1000)]
    zh = language == "zh"
    with platform(settings.state_dir, evidence / "platform.log") as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 960})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.add_init_script("""window.addEventListener('message', event => {
          if (event.data?.channel === 'opendde-viewer' && event.data.type === 'load')
            window.__verifiedContactLoad = event.data.value;
        });""")
        errors, writes = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                writes.append(request.url)
                if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(base + "/#task=" + job)
        bar = page.get_by_role("region", name="构象与置信度" if zh else "Sample and confidence")
        review = page.get_by_role(
            "region", name="实验受体对照" if zh else "Experimental receptor comparison", exact=True
        )
        viewer = page.locator(".structure-workbench .viewer-panel").first
        export = viewer.get_by_role(
            "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
        )
        report_link = review.get_by_role(
            "link", name="查看原始 PLIP 报告" if zh else "View original PLIP report", exact=True
        )

        def frame_state():
            expect(export).to_be_enabled(timeout=45000)
            return (
                viewer.frame_locator("iframe")
                .locator("#molecule")
                .evaluate("() => window.__verifiedContactLoad")
            )

        for candidate in ("001", "002"):
            bar.get_by_role(
                "button", name=("构象 " if zh else "Sample ") + f"structure-{candidate}", exact=True
            ).click()
            expect(review).to_contain_text(f"structure-{candidate}")
            expect(review).to_contain_text(
                "与省略的受体结构域冲突" if zh else "Clashes with omitted receptor domains"
            )
            if zh:
                expect(page.locator(".prediction-reference-mobile-status")).to_be_visible()
            expect(report_link).to_have_count(0)
            state = frame_state()
            assert not state.get("nativeInteractions")
            assert parse_qs(urlparse(state["urls"][0]).query)["name"] == [
                f"structure-{candidate}.cif"
            ]
        review.scroll_into_view_if_needed()
        page.screenshot(path=evidence / "omitted-domain-conflict.png")

        review.get_by_role(
            "button", name="查看复核构象 003" if zh else "Inspect reviewed sample 003"
        ).click()
        expect(review).to_contain_text("0.633 Å")
        expect(report_link).to_have_attribute("href", "/#task=" + str(supporting.job_id))
        table = review.get_by_role(
            "table", name="已核对的 PLIP 接触" if zh else "Verified PLIP contacts"
        )
        expect(table.locator("tbody tr")).to_have_count(3)
        expect(table).to_contain_text("A:GLN74")
        expect(table).to_contain_text("3.77")
        expect(table).to_contain_text("候选氢键" if zh else "Hydrogen-bond candidate")
        state = frame_state()
        assert parse_qs(urlparse(state["urls"][0]).query)["name"] == ["structure-003.cif"]
        native = page.request.get(base + f"/api/jobs/{supporting.job_id}/download?name=result.json")
        assert native.ok
        assert state["nativeInteractions"] == native.json()["interactions"]
        expect(
            viewer.get_by_role(
                "checkbox", name="显示原生化学接触" if zh else "Show native chemical contacts"
            )
        ).to_be_checked()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        review.scroll_into_view_if_needed()
        page.screenshot(path=evidence / "reviewed-native-contacts.png")
        reviewed_frame = viewer.locator("iframe").element_handle()
        assert reviewed_frame
        bar.get_by_role(
            "button", name="构象 structure-001" if zh else "Sample structure-001", exact=True
        ).click()
        assert not reviewed_frame.evaluate("(frame) => frame.isConnected")
        expect(report_link).to_have_count(0)
        state = frame_state()
        assert not state.get("nativeInteractions")
        assert parse_qs(urlparse(state["urls"][0]).query)["name"] == ["structure-001.cif"]
        if not zh:

            def replace_viewer_bytes(route):
                if route.request.frame.parent_frame is None:
                    route.continue_()
                    return
                response = route.fetch()
                assert response.ok
                route.fulfill(status=200, body=response.body() + b"\n")

            page.route("**/download?name=structure-003.cif", replace_viewer_bytes)
            bar.get_by_role("button", name="Sample structure-003", exact=True).click()
            expect(viewer.get_by_role("alert")).to_contain_text(
                "This structure differs from the reviewed file", timeout=45000
            )
            expect(review).to_have_count(0)
            expect(export).to_be_disabled()
            expect(
                viewer.get_by_role("checkbox", name="Show native chemical contacts")
            ).to_have_count(0)
            page.unroute("**/download?name=structure-003.cif", replace_viewer_bytes)
            viewer.get_by_role("button", name="Reload", exact=True).click()
            expect(report_link).to_be_visible(timeout=45000)
            assert frame_state()["nativeInteractions"] == native.json()["interactions"]
        assert not writes and not errors
        assert [entry.model_dump(mode="json") for entry in store.list_jobs(1000)] == before
        browser.close()
