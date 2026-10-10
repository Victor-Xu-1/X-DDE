"""Native selected-file drawings, calculated input views and exact exports."""

import base64
import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("outputs/workspace-preview")


@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_selected_file_previews_and_exact_record_switching(language):
    cases = json.loads((EVIDENCE / "cases.json").read_text())
    evidence = EVIDENCE / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, evidence / "browser.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if (
                    request.method == "POST"
                    and request.url.split("?")[0].endswith(
                        ("/api/jobs", "/api/batches", "/api/research/poses/minimize")
                    )
                )
                else None
            ),
        )
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        original = {
            key: hashlib.sha256(
                page.request.get(base + "/api/assets/" + value["reference"]["asset_id"]).body()
            ).hexdigest()
            for key, value in cases.items()
        }
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        files = page.get_by_role(
            "list", name="资产与任务" if zh else "Assets and tasks", exact=True
        )

        def select(key):
            value = cases[key]
            kind = (
                ("结构" if zh else "Structure")
                if value["kind"] == "structure"
                else ("分子" if zh else "Molecule")
            )
            files.get_by_role("button", name=kind + ": " + value["label"], exact=True).click()
            expect(page.get_by_role("heading", name=value["label"], exact=True)).to_be_visible()
            return page.get_by_role(
                "region", name="所选文件预览" if zh else "Selected file preview", exact=True
            )

        def drawing(key):
            preview = select(key)
            image = preview.locator(".molecule-image")
            expect(image).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            data = image.locator("img").get_attribute("src")
            assert data.startswith("data:image/svg+xml;base64,")
            raw = base64.b64decode(data.split(",", 1)[1])
            (evidence / (key + ".svg")).write_bytes(raw)
            return preview, hashlib.sha256(raw).hexdigest()

        warhead, first = drawing("study_ligand")
        export_figure(
            page,
            warhead.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ),
            evidence,
            "warhead-print",
            language,
            "SVG",
        )
        warhead.get_by_role("tab", name="三维结构" if zh else "3D structure", exact=True).click()
        expect(
            warhead.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
            )
        ).to_be_enabled(timeout=45000)
        assert page.request.get(base + "/api/jobs").json() == jobs, (
            "A retained calculated input must not create a new minimization"
        )
        native = export_figure(
            page,
            warhead.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            ),
            evidence,
            "warhead-3d-print",
            language,
        )
        inspect_png(native)
        page.screenshot(path=evidence / "warhead-3d.png", full_page=True)
        _, second = drawing("study_protac")
        assert first != second, "File switching retained the wrong molecular drawing"
        selected, restored = drawing("study_ligand")
        assert first == restored
        library, record = drawing("series_second")
        assert record == second, "Record 2 did not depict its exact source molecule"
        expect(library.get_by_text("记录 2" if zh else "Record 2", exact=True)).to_be_visible()
        select("stat6_receptor")
        expect(
            page.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
            )
        ).to_be_enabled(timeout=45000)
        expect(page.locator(".research-selected-preview .viewer-panel")).to_have_count(1)
        expect(page.locator(".research-workspace > .viewer-panel")).to_have_count(0)
        drawing("study_protac")
        page.get_by_text(
            "查看文件之间的关系" if zh else "Show file relationships", exact=True
        ).click()
        graph = page.get_by_role(
            "group", name="科学资产关系图" if zh else "Scientific asset relationships", exact=True
        )
        expect(graph).to_have_attribute("width", "620")
        assert graph.bounding_box()["width"] <= 620
        for width in (2560, 1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            page.locator(".research-selected-preview").scroll_into_view_if_needed()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=evidence / f"selected-protac-{width}.png", full_page=True)
        assert not errors, errors
        assert not submissions, submissions
        assert page.request.get(base + "/api/jobs").json() == jobs
        for key, value in cases.items():
            assert (
                hashlib.sha256(
                    page.request.get(base + "/api/assets/" + value["reference"]["asset_id"]).body()
                ).hexdigest()
                == original[key]
            )
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "source_sha256": original,
                    "warhead_svg": first,
                    "protac_svg": second,
                    "record_2_svg": record,
                    "new_scientific_jobs": 0,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
