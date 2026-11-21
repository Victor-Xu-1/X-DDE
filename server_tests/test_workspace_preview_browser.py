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
from server_tests.workspace_preview_viewing import inspect_molecular_viewing

EVIDENCE = Path("outputs/workspace-preview")


def exit_expanded_files(page, language):
    exit_label = "退出文件展开视图" if language == "zh" else "Exit expanded file view"
    expanded = page.locator(".research-workspace [data-workspace-expanded]")
    exit_button = expanded.get_by_role("button", name=exit_label, exact=True)
    expect(exit_button).to_be_visible()
    exit_button.click()
    expect(expanded).to_have_count(0)
    search_label = "查找研究文件或任务" if language == "zh" else "Find research files or tasks"
    expect(page.get_by_role("searchbox", name=search_label, exact=True)).to_be_focused()
    assert not page.locator(".studio-topbar").evaluate("el => Boolean(el.closest('[inert]'))")


def inspect_desktop_structure(page, preview, evidence, language, source_sha256):
    zh = language == "zh"
    inspector = page.locator(".research-inspector-heading")
    frame = preview.locator(".molecular-stage iframe")
    library = page.locator(".research-file-library")
    toolbar = library.locator(".research-file-toolbar")
    measurements = []
    for width, height in ((1001, 600), (1110, 580), (1280, 720), (1600, 775)):
        page.set_viewport_size({"width": width, "height": height})
        page.evaluate("window.scrollTo(0, 0)")
        viewer_box = frame.bounding_box()
        rail = library.bounding_box()
        file_list = library.locator(".research-node-list").bounding_box()
        file_actions = toolbar.bounding_box()
        assert viewer_box and rail and file_list and file_actions
        assert viewer_box["x"] + viewer_box["width"] <= rail["x"]
        assert viewer_box["width"] > rail["width"] * 1.35
        assert viewer_box["height"] >= 280
        visible = min(viewer_box["height"], height - viewer_box["y"])
        assert visible >= max(250, viewer_box["height"] * 0.90), viewer_box
        assert file_list["y"] <= 300, file_list
        assert file_list["y"] + file_list["height"] <= file_actions["y"]
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        upload = toolbar.locator("input[type=file]")
        expect(upload).to_be_enabled()
        expect(upload).to_be_in_viewport(ratio=1)
        refresh = toolbar.get_by_role("button", name="刷新" if zh else "Refresh", exact=True)
        expect(refresh).to_be_enabled()
        expect(refresh).to_be_in_viewport(ratio=1)
        expect(preview.locator(".molecular-stage")).to_have_css("border-top-left-radius", "10px")
        page.screenshot(path=evidence / f"desktop-file-{width}.png")
        measurements.append({
            "width": width, "height": height, "viewer": viewer_box,
            "visible": visible, "file_list": file_list,
        })

    page.set_viewport_size({"width": 1110, "height": 580})
    search = library.get_by_role("searchbox")
    search.fill("fixture-with-no-matching-research-file")
    expect(library.locator(".research-node-list li")).to_have_count(0)
    chooser_input = toolbar.locator("input[type=file]")
    expect(chooser_input).to_be_in_viewport(ratio=1)
    with page.expect_file_chooser():
        chooser_input.click()
    search.fill("")
    expect(library.locator(".research-node-list li").first).to_be_visible()

    page.set_viewport_size({"width": 1280, "height": 800})
    original = frame.element_handle()
    assert original
    expand = inspector.get_by_role(
        "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
    )
    expand.click()
    close = inspector.get_by_role(
        "button", name="关闭展开视图" if zh else "Close expanded view", exact=True
    )
    expect(close).to_be_visible()
    assert frame.evaluate("(current, previous) => current === previous", original)
    close.click()
    expect(expand).to_be_focused()
    assert frame.evaluate("(current, previous) => current === previous", original)
    action = inspector.get_by_role(
        "button", name="下载此版本" if zh else "Download version", exact=True
    )
    with page.expect_download() as download:
        action.click()
    assert hashlib.sha256(download.value.path().read_bytes()).hexdigest() == source_sha256

    def configure(dialog):
        layout = dialog.get_by_role("combobox", name="图件比例" if zh else "Panel layout")
        layout.select_option("landscape")
        dialog.get_by_role("combobox", name="清晰度" if zh else "Resolution").select_option("300")

    figure = export_figure(
        page,
        preview.get_by_role("button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True),
        evidence,
        "desktop-receptor-300",
        language,
        configure=configure,
    )
    inspect_png(figure, dpi=300, width=1051)

    expand.click()
    page.set_viewport_size({"width": 900, "height": 800})
    page.get_by_role(
        "button", name="返回文件列表" if zh else "Back to files", exact=True
    ).click()
    expect(preview).not_to_be_visible()
    exit_expanded_files(page, language)
    page.set_viewport_size({"width": 1280, "height": 800})

    expand.click()
    toolbar.get_by_role(
        "button", name="取消选择" if zh else "Clear selection", exact=True
    ).click()
    expect(frame).to_have_count(0)
    exit_expanded_files(page, language)
    (evidence / "desktop-file-layout.json").write_text(
        json.dumps(measurements, indent=2), encoding="utf-8"
    )


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
            # Returning to a source keeps its last view; explicitly request its 2D drawing.
            preview.get_by_role(
                "tab", name="二维结构" if zh else "2D structure", exact=True
            ).click()
            image = preview.locator(".molecule-image")
            expect(image).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            data = image.locator("img").get_attribute("src")
            assert data.startswith("data:image/svg+xml;base64,")
            raw = base64.b64decode(data.split(",", 1)[1])
            (evidence / (key + ".svg")).write_bytes(raw)
            return preview, hashlib.sha256(raw).hexdigest()

        warhead, first = drawing("study_ligand")
        page.set_viewport_size({"width": 1001, "height": 600})
        page.evaluate("window.scrollTo(0, 0)")
        drawing_box = warhead.locator(".figure-preview-sheet").bounding_box()
        assert drawing_box and drawing_box["width"] >= 345
        visible_drawing = min(drawing_box["height"], 600 - drawing_box["y"])
        assert visible_drawing >= 220, drawing_box
        expect(files).to_be_in_viewport()
        page.screenshot(path=evidence / "desktop-warhead-1001.png")
        page.set_viewport_size({"width": 1440, "height": 1000})
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
        inspector = page.locator(".research-inspector-heading")
        inspector.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
        ).click()
        warhead.get_by_role(
            "tab", name="二维结构" if zh else "2D structure", exact=True
        ).click()
        expect(warhead.locator(".molecular-stage iframe")).not_to_be_visible()
        close = inspector.get_by_role(
            "button", name="关闭展开视图" if zh else "Close expanded view", exact=True
        )
        expect(close).to_be_visible()
        close.click()
        expect(page.locator(".research-workspace [data-workspace-expanded]")).to_have_count(0)
        _, second = drawing("study_protac")
        assert first != second, "File switching retained the wrong molecular drawing"
        selected, restored = drawing("study_ligand")
        assert first == restored
        library, record = drawing("series_second")
        assert record == second, "Record 2 did not depict its exact source molecule"
        expect(library.get_by_text("记录 2" if zh else "Record 2", exact=True)).to_be_visible()
        receptor = select("stat6_receptor")
        expect(
            page.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True
            )
        ).to_be_enabled(timeout=45000)
        expect(page.locator(".research-selected-preview .viewer-panel")).to_have_count(1)
        expect(page.locator(".research-workspace > .viewer-panel")).to_have_count(0)
        inspect_desktop_structure(page, receptor, evidence, language, original["stat6_receptor"])
        page.set_viewport_size({"width": 1440, "height": 1000})
        # Replace only the browser response. The original archive and its identity stay intact.
        url = f"{base}/api/assets/{cases['stat6_receptor']['reference']['asset_id']}"
        receptor_response = page.request.get(url)
        tampered_downloads = []
        capture = "生成三维视图图片" if zh else "Capture 3D view"
        original_bytes = receptor_response.body()
        replacement = b"\r" if original_bytes.endswith(b"\n") else b"\n"

        def replace_bytes(route):
            route.fulfill(response=receptor_response, body=original_bytes[:-1] + replacement)

        page.on("download", lambda download: tampered_downloads.append(download))
        page.route(url, replace_bytes)
        suspect = select("stat6_receptor")
        expect(suspect.get_by_role("alert")).to_be_visible(timeout=45000)
        expect(suspect.get_by_role("button", name=capture, exact=True)).to_be_disabled()
        name = "下载此版本" if zh else "Download version"
        inspector.get_by_role("button", name=name, exact=True).click()
        expect(inspector.get_by_role("alert")).to_be_visible()
        assert not tampered_downloads
        page.unroute(url, replace_bytes)
        metadata = page.request.get(url + "/metadata").json()
        with page.expect_download() as recovered:
            inspector.get_by_role("button", name=name, exact=True).click()
        assert recovered.value.suggested_filename == metadata["name"]
        assert recovered.value.path().read_bytes() == original_bytes
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
            if width == 390:
                narrow_preview = page.locator(".research-selected-preview")
                inspect_molecular_viewing(page, narrow_preview, evidence, language)
                back = page.get_by_role(
                    "button", name="返回文件列表" if zh else "Back to files", exact=True
                )
                expect(files).to_be_hidden()
                back.press("Space")
                search = page.get_by_role(
                    "searchbox",
                    name="查找研究文件或任务" if zh else "Find research files or tasks",
                )
                label = cases["study_protac"]["label"]
                search.fill(label)
                row = files.get_by_role(
                    "button", name=("分子: " if zh else "Molecule: ") + label, exact=True
                )
                row.press("Space")
                expect(page.get_by_role(
                    "region", name="研究文件详情" if zh else "Research file details",
                )).to_be_focused()
                expect(narrow_preview).to_be_visible()
                expect(files).to_be_hidden()
                assert back.bounding_box()["height"] >= 44
                page.screenshot(path=evidence / "narrow-file-inspection.png")
                back.press("Space")
                expect(narrow_preview).to_be_hidden()
                expect(row).to_be_focused()
                expect(row).to_have_attribute("aria-current", "true")
                expect(row).to_be_in_viewport()
                expect(search).to_have_value(label)
                page.screenshot(path=evidence / "narrow-return-to-files.png")
                # The filter still refers to the old file when a user uploads.
                source_id = cases["study_ligand"]["reference"]["asset_id"]
                source_bytes = page.request.get(base + "/api/assets/" + source_id).body()
                uploaded = f"browser-reuse-{language}.sdf"
                page.locator(".research-file-toolbar input[type=file]").set_input_files(
                    {"name": uploaded, "mimeType": "chemical/x-mdl-sdfile", "buffer": source_bytes}
                )
                expect(page.get_by_role("heading", name=uploaded, exact=True)).to_be_visible()
                expect(files).to_be_hidden()
                expect(page.get_by_role(
                    "region", name="研究文件详情" if zh else "Research file details",
                )).to_be_focused()
                back.press("Space")
                expect(search).to_have_value(label)
                expect(search).to_be_focused()
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
        inspector = page.locator(".research-inspector-heading")
        expand = inspector.get_by_role(
            "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True
        )
        expand.click()
        expect(preview.get_by_role("heading", name=header, exact=True)).to_be_visible()
        inspector.get_by_role(
            "button", name="关闭展开视图" if zh else "Close expanded view", exact=True
        ).click()
        expect(expand).to_be_focused()
        filename = page.request.get(source_url + "/metadata").json()["name"]
        with page.expect_download() as saved_file:
            inspector.get_by_role(
                "button", name="下载此版本" if zh else "Download version", exact=True
            ).click()
        assert saved_file.value.suggested_filename == filename
        assert saved_file.value.path().read_bytes() == original
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
        expect(jump).to_have_value("2")
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
