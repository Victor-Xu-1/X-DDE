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
            page.evaluate("""() => new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)))""")
            if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                page.screenshot(path=evidence / f"overflow-{width}.png", full_page=True)
                (evidence / f"overflow-{width}.json").write_text(
                    json.dumps(
                        page.evaluate(
                            """() => ({width:innerWidth,
                    scrollWidth:document.documentElement.scrollWidth,
                    nodes:[...document.querySelectorAll('main *')].map(node=>{
                      const b=node.getBoundingClientRect(),s=getComputedStyle(node);
                      return {tag:node.tagName,class:node.className,
                        left:b.left,right:b.right,width:b.width,overflow:s.overflow};
                    }).filter(node=>node.width>0 && node.right>innerWidth+1).slice(0,30)})"""
                        ),
                        indent=2,
                    )
                )
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


@pytest.mark.parametrize("language", ["en", "zh"])
def test_retained_stat6_sequence_inspection_positions_and_downloads(language):
    cases = json.loads((EVIDENCE / "cases.json").read_text())
    evidence = EVIDENCE / language / "sequences"
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    case = cases["sequence_records"]
    with (
        platform(Settings.from_env().state_dir, evidence / "browser.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        source_url = base + "/api/assets/" + case["reference"]["asset_id"]
        original = page.request.get(source_url).body()
        header = original.decode().splitlines()[0][1:]
        first_sequence = "".join(original.decode().split(">", 2)[1].splitlines()[1:])
        assert len(first_sequence) == 847
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        files = page.get_by_role(
            "list", name="资产与任务" if zh else "Assets and tasks", exact=True
        )
        files.get_by_role(
            "button", name=("序列: " if zh else "Sequence: ") + case["label"], exact=True
        ).click()
        preview = page.get_by_role(
            "region", name="所选文件预览" if zh else "Selected file preview", exact=True
        )
        expect(preview.get_by_role("heading", name=header, exact=True)).to_be_visible()
        expect(
            preview.get_by_text("847 个位置" if zh else "847 positions", exact=True)
        ).to_be_visible()
        assert preview.locator(".sequence-residue-grid button").count() == 600
        jump = preview.get_by_role(
            "spinbutton", name="跳转位置" if zh else "Go to position", exact=True
        )
        jump.fill("847")
        jump.press("Enter")
        end = preview.get_by_role(
            "button", name=header + " · 847 " + first_sequence[-1], exact=True
        )
        expect(end).to_have_attribute("aria-pressed", "true")
        end.focus()
        end.press("Home")
        first = preview.get_by_role("button", name=header + " · 1 " + first_sequence[0], exact=True)
        expect(first).to_be_focused()
        first.press("ArrowRight")
        expect(
            preview.get_by_role("button", name=header + " · 2 " + first_sequence[1], exact=True)
        ).to_be_focused()
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            preview.scroll_into_view_if_needed()
            page.wait_for_function(
                "() => document.documentElement.scrollWidth <= innerWidth + 1", timeout=5000
            )
            page.screenshot(path=evidence / f"stat6-sequence-{width}.png", full_page=False)
        record = preview.get_by_role(
            "combobox", name="序列记录" if zh else "Sequence record", exact=True
        )
        record.select_option("1")
        expect(
            preview.get_by_role(
                "heading", name="STAT6 P42226 positions 601-847; display slice", exact=True
            )
        ).to_be_visible()
        expect(
            preview.get_by_text("247 个位置" if zh else "247 positions", exact=True)
        ).to_be_visible()
        expect(preview.locator(".sequence-residue-grid button[aria-pressed=true]")).to_have_count(0)
        with page.expect_download() as download:
            preview.get_by_role(
                "button",
                name="下载此序列 FASTA" if zh else "Download this sequence FASTA",
                exact=True,
            ).click()
        path = evidence / "stat6-selected-record.fasta"
        download.value.save_as(path)
        downloaded = path.read_text().splitlines()
        assert downloaded[0] == ">STAT6 P42226 positions 601-847; display slice"
        assert "".join(downloaded[1:]) == first_sequence[600:]
        assert page.request.get(source_url).body() == original
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not errors, errors
        (evidence / "acceptance.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "positions": 847,
                    "maximum_rendered_positions": 600,
                    "original_sha256": hashlib.sha256(original).hexdigest(),
                    "selected_record_length": 247,
                    "new_scientific_jobs": 0,
                    "errors": errors,
                },
                indent=2,
            )
        )
        browser.close()
