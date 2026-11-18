"""Review a retained native conformer without starting molecular preparation."""

import hashlib
import re
from pathlib import Path
from urllib.parse import urlencode

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.interaction_workspace_case import retained_contact_workspace  # noqa: F401


@pytest.mark.parametrize(
    "lang,width,height", [("en", 1440, 900), ("zh", 390, 775), ("en", 320, 568)]
)
def test_retained_conformers_render_and_switch_without_preparation(
    interaction_workspace, lang, width, height
):
    evidence = Path("outputs/state-results") / f"{lang}-{width}"
    evidence.mkdir(parents=True, exist_ok=True)
    with platform(interaction_workspace.state_dir, evidence / "service.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(
                channel="chrome", args=["--enable-unsafe-swiftshader"]
            )
            page = browser.new_page(viewport={"width": width, "height": height})
            page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{lang}')")
            zh = lang == "zh"
            writes = []
            page.on("request", lambda req: writes.append(req.url)
                    if req.method in {"POST", "PUT", "PATCH", "DELETE"} else None)
            pin = page.request.get(base + "/api/examples/chemistry.states").json()["pin"]
            job = pin["job_id"]
            jobs = page.request.get(base + "/api/jobs").json()
            root = base + f"/api/jobs/{job}"
            result = page.request.get(root + "/result").json()
            first, second = result["conformers"][:2]
            assert len(result["states"]) == 16 and len(result["conformers"]) == 46
            assert first["state_index"] == second["state_index"] == 0
            first_url = root + "/download?" + urlencode({"name": first["artifact"]})
            second_url = root + "/download?" + urlencode({"name": second["artifact"]})
            original = page.request.get(first_url).body()
            selected_bytes = page.request.get(second_url).body()
            assert hashlib.sha256(original).hexdigest() == first["artifact_sha256"]
            assert hashlib.sha256(selected_bytes).hexdigest() == second["artifact_sha256"]
            page.goto(base + "/#task=" + job)
            preview = page.locator(".state-native-preview")
            expect(preview).to_be_visible(timeout=15000)
            scene = preview.locator(".molecular-stage")
            action = preview.locator(".figure-export-trigger")
            expect(action).to_be_enabled(timeout=30000)
            assert scene.evaluate("""e => {
                const rect = e.getBoundingClientRect();
                return rect.top + rect.height / 2 <= innerHeight - 20;
            }""")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
            page.screenshot(path=evidence / "first-viewport.png")
            expect(page.get_by_role(
                "tab", name=re.compile("游离构象" if zh else "Free conformers")
            )).to_have_attribute("aria-selected", "true")
            conformer = preview.get_by_role(
                "combobox", name="游离构象" if zh else "Free conformer", exact=True
            )
            download_name = (
                "下载所选原始构象 SDF" if zh else "Download selected original conformer SDF"
            )
            download = preview.get_by_role("button", name=download_name, exact=True)
            # Substitute a valid but different SDF. The renderer must bind the selected hash
            # instead of displaying stale/potentially unrelated native coordinates.
            if width == 1440:
                page.route(
                    second_url,
                    lambda route: route.fulfill(
                        status=200,
                        headers={"Content-Type": "application/octet-stream",
                                 "X-Structure-Format": "sdf"},
                        body=original,
                    ),
                )
                with page.expect_response(second_url, timeout=30000):
                    conformer.select_option(str(second["record"]))
            else:
                conformer.select_option(str(second["record"]))
            if width == 1440:
                expect(preview.locator(".viewer-error")).to_be_visible(timeout=15000)
                transfers = []
                page.on("download", transfers.append)
                expect(preview.locator(".viewer-original-downloads")).to_have_count(0)
                download.click()
                error = preview.locator(".state-conformer-download").get_by_role("alert")
                expect(error).to_have_text(
                    "Could not verify the original conformer. Try again.", timeout=15000
                )
                assert transfers == []
                page.unroute(second_url)
                preview.locator(".viewer-error").get_by_role("button", name="Reload").click()
            expect(action).to_be_enabled(timeout=30000)
            with page.expect_download() as transfer:
                download.click()
            output = evidence / "selected.sdf"
            transfer.value.save_as(output)
            assert output.read_bytes() == selected_bytes
            different = next(value for value in result["conformers"] if value["state_index"] != 0)
            preview.get_by_role(
                "combobox", name="化学状态" if zh else "Chemical state", exact=True
            ).select_option(str(different["state_index"]))
            expect(conformer).to_have_value(str(different["record"]))
            expect(action).to_be_enabled(timeout=30000)
            assert download.is_enabled()
            forms = page.locator(".molecular-state-results .state-result-notes")
            expect(forms).not_to_have_attribute("open", "")
            forms.get_by_text("结果说明与源文件" if zh else "Result notes and source files").click()
            expect(forms.get_by_role("link")).to_have_count(2)
            assert page.request.get(base + "/api/jobs").json() == jobs
            assert writes == []
            browser.close()
