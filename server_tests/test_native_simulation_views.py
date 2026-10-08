"""Native MD/FEP output rendered by the actual app; no invented chart coordinates."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg


@pytest.mark.parametrize("case", ["openmm.dynamics", "openfe.rbfe", "openfe.calculation"])
@pytest.mark.parametrize("language", ["en", "zh"])
def test_native_result_views_and_downloads(case, language):
    source = Path("outputs/native-simulations") / case
    assert (source / "state/jobs.sqlite3").is_file(), (
        "Run the exact native simulation fixture first."
    )
    identifier = (source / "job-id.txt").read_text()
    evidence = source / "browser"
    evidence.mkdir(exist_ok=True)
    # Deploy only the reviewed graphical editor, using the same managed component registry.
    import json
    from uuid import uuid4

    from opendde_workbench.deployment.installers import install
    from opendde_workbench.locations import atomic_json

    config = json.loads((source / "state/deployment.json").read_text())
    component_root = Path(config["root"])
    installed = (
        json.loads((component_root / "installed.json").read_text())
        if (component_root / "installed.json").is_file()
        else {}
    )
    if "ketcher" not in installed:
        installed["ketcher"] = install(
            "ketcher", component_root, installed, str(uuid4()), print, lambda: None
        )
        atomic_json(component_root / "installed.json", installed)
    with platform(source / "state", evidence / (language + ".log")) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/#task=" + identifier)
        root = page.get_by_test_id(
            "dynamics-results" if case == "openmm.dynamics" else "free-energy-results"
        )
        expect(root).to_be_visible(timeout=30000)

        def loaded(viewer):
            scene = viewer.locator(".simulation-webgl")
            page.wait_for_function(
                "() => { const scene = document.querySelector('.simulation-webgl');"
                " return scene?.dataset.loaded === 'true' || !!scene?.dataset.error; }",
                timeout=45000,
            )
            if scene.get_attribute("data-error"):
                page.screenshot(
                    path=str(evidence / (language + "-load-failure.png")), full_page=True
                )
            assert scene.get_attribute("data-error") is None, (
                scene.get_attribute("data-error"),
                errors,
            )
            expect(scene).to_have_attribute("data-loaded", "true")

        if case == "openmm.dynamics":
            viewer = root.get_by_test_id("molstar-viewport")
            expect(viewer).to_be_visible()
            expect(viewer.locator("canvas")).to_be_visible(timeout=30000)
            loaded(viewer)
            page.get_by_role(
                "slider", name="Trajectory time" if language == "en" else "轨迹时间"
            ).fill("3")
            expect(
                root.get_by_role(
                    "link", name="Download frame" if language == "en" else "下载当前结构"
                )
            ).to_have_attribute(
                "href", f"/api/jobs/{identifier}/download?name=repeat-1-frame-0004.pdb"
            )
            expect(viewer).to_have_attribute("data-frame", "3", timeout=30000)
            expect(
                root.get_by_role(
                    "application",
                    name="Residue fluctuations" if language == "en" else "残基波动",
                    exact=True,
                )
            ).to_be_visible()
            expect(root.locator(".js-plotly-plot").first).to_be_visible(timeout=30000)
            # Actual plotted points select the exact native trajectory frame.
            plot = root.locator(".js-plotly-plot").first
            plot.evaluate(
                "el => el.on('plotly_click', event => {"
                " el.dataset.clickedX = String(event.points[0]?.x); })"
            )
            plot.evaluate("el => el.scrollIntoView({ block: 'center' })")
            point = plot.locator(".scatterlayer .point").nth(2)
            box = point.bounding_box()
            assert box is not None
            x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            page.screenshot(
                path=str(evidence / (language + "-md-plot-inspection.png")), full_page=False
            )
            import json

            geometry = page.evaluate(
                """({x,y}) => ({ x,y,
              hit: document.elementFromPoint(x,y)?.outerHTML.slice(0,500),
              charts: Array.from(document.querySelectorAll('.js-plotly-plot')).map(el => ({
                bounds: el.getBoundingClientRect().toJSON(),
                svgs: Array.from(el.querySelectorAll('.main-svg')).map(s => ({
                  bounds: s.getBoundingClientRect().toJSON(),
                  width: s.getAttribute('width'), height: s.getAttribute('height')
                }))
              }))
            })""",
                {"x": x, "y": y},
            )
            (evidence / (language + "-plot-geometry.json")).write_text(json.dumps(geometry))
            page.mouse.move(x, y)
            expect(plot.locator(".hoverlayer .hovertext")).to_be_visible()
            page.mouse.click(x, y)
            assert plot.get_attribute("data-clicked-x") is not None, (
                "Native Plotly point click was not delivered."
            )
            expect(viewer).to_have_attribute("data-frame", "2", timeout=30000)
            # View export is separate from scientific coordinate-file download.
            png = export_figure(
                page,
                viewer.get_by_role(
                    "button", name="Download view" if language == "en" else "下载视图"
                ),
                evidence,
                language + "-md-figure",
                language,
            )
            inspect_png(png)
            expect(viewer).to_have_attribute("data-frame", "2")
            chart = root.locator(".research-plot").first
            svg = export_figure(
                page,
                chart.get_by_role(
                    "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓"
                ),
                evidence,
                language + "-md-curve",
                language,
                "SVG",
            )
            inspect_svg(svg, "RMSD" if language == "en" else "RMSD")
        else:
            expect(
                root.get_by_role(
                    "application",
                    name="Relative binding free-energy perturbation network"
                    if language == "en"
                    else "相对结合自由能变化网络",
                )
            ).to_be_visible()
            expect(root.locator(".fep-network-canvas canvas").first).to_be_visible(timeout=30000)
            # Native Ketcher 2D drawings are part of this actual result inspection.
            images = root.locator(".simulation-molecule-pair img")
            expect(images).to_have_count(2, timeout=30000)
            assert images.evaluate_all(
                "images => images.every(image => image.complete && image.naturalWidth > 0)"
            )
            network = root.locator(".fep-network")
            png = export_figure(
                page,
                network.get_by_role(
                    "button", name="文献图导出 ↓" if language == "zh" else "Export figure ↓"
                ),
                evidence,
                language + "-fep-network",
                language,
            )
            inspect_png(png)
            root.get_by_role(
                "tab", name="Binding poses" if language == "en" else "结合姿势", exact=True
            ).click()
            pose = root.get_by_test_id("molstar-viewport")
            loaded(pose)
            root.get_by_role(
                "combobox", name="Binding pose display" if language == "en" else "结合姿势显示"
            ).select_option("b")
            root.get_by_role(
                "combobox", name="Binding pose display" if language == "en" else "结合姿势显示"
            ).select_option("all")
            png = export_figure(
                page,
                pose.get_by_role(
                    "button", name="Download view" if language == "en" else "下载视图"
                ),
                evidence,
                language + "-fep-pose",
                language,
            )
            inspect_png(png)
            if case == "openfe.calculation":
                root.get_by_role(
                    "tab", name="Sampling and convergence" if language == "en" else "采样与收敛"
                ).click()
                expect(
                    root.get_by_role(
                        "application",
                        name="Sampling overlap" if language == "en" else "采样重叠",
                        exact=True,
                    )
                ).to_be_visible()
                root.get_by_role(
                    "tab", name="Convergence" if language == "en" else "收敛曲线", exact=True
                ).click()
        for width in (1440, 768, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            page.wait_for_function(
                "() => document.documentElement.scrollWidth <= innerWidth + 1", timeout=5000
            )
            root.scroll_into_view_if_needed()
            page.screenshot(path=str(evidence / f"{language}-{width}-results.png"), full_page=True)
            page.screenshot(
                path=str(evidence / f"{language}-{width}-viewport.png"), full_page=False
            )
        assert not errors
        browser.close()
