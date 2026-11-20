"""Exercise the three retained STAT6 spatial results without running scientific tools."""

import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png, inspect_svg
from server_tests.test_apbs_range_browser import inspect_surface

EVIDENCE = Path("outputs/spatial-results-desktop")
CASES = (
    ("apbs.potential", ".apbs-result", 2),
    ("caver.paths", ".channel-results", 3),
    ("biopython.exposure", ".surface-results", 3),
)


def layout(page, result, width, height):
    frame = result.locator(".molecular-stage iframe")
    canvas = frame.bounding_box()
    rail = result.locator(".spatial-result-summary").bounding_box()
    actions = result.locator(".spatial-summary-downloads").bounding_box()
    assert canvas and rail and actions
    assert canvas["x"] + canvas["width"] < rail["x"]
    assert canvas["width"] >= 595 and canvas["y"] < 345
    if "surface-results" in result.get_attribute("class").split() and height <= 840:
        assert canvas["height"] >= 400 and canvas["y"] + canvas["height"] <= height
    else:
        assert canvas["height"] >= 500
    assert abs(canvas["y"] - rail["y"]) < 165
    assert actions["y"] + actions["height"] <= height
    assert rail["x"] + rail["width"] <= width
    for table in result.locator(".channel-table-wrap, .research-table-scroll").all():
        assert table.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    return canvas


def verify_apbs(page, result, frame, zh):
    legend = result.locator(".potential-legend")
    expect(legend).to_contain_text("+5 kBT/e")
    expect(legend).to_be_in_viewport()
    bounds = legend.bounding_box()
    canvas = frame.bounding_box()
    assert bounds and canvas and 0 <= bounds["y"] - canvas["y"] < 45
    before = inspect_surface(frame, remember=True)
    selector = result.get_by_role("combobox", name="颜色范围" if zh else "Color range")
    selector.select_option("10")
    expect(legend).to_contain_text("+10 kBT/e")
    after = inspect_surface(frame)
    assert after["sameGeometry"] and after["camera"] == before["camera"]
    assert after["png"] != before["png"]
    selector.select_option("5")
    expect(legend).to_contain_text("+5 kBT/e")
    assert inspect_surface(frame)["png"] == before["png"]
    assert not page.locator(".viewer-error").count()


def verify_channel(result, zh, native):
    expect(result.locator(".channel-summary")).to_contain_text(
        f"{native['channels'][0]['bottleneck_radius_angstrom']:.2f}"
    )
    toggle = result.get_by_role(
        "checkbox", name="显示采样空间" if zh else "Show sampled clearance",
    )
    toggle.uncheck()
    expect(toggle).not_to_be_checked()
    result.get_by_role("button", name="定位通道" if zh else "Focus channel", exact=True).click()
    expect(result.locator(".channel-profile svg")).to_be_visible()
    toggle.check()


def verify_exposure(result, zh, native):
    expect(result.locator(".surface-summary")).to_contain_text(f"{native['assembly_area']:.1f}")
    panel = result.get_by_role("tabpanel")
    result.get_by_role("tab", name="按区域" if zh else "By region").click()
    selected = panel.locator(".record-select").first
    selected.press("Enter")
    expect(selected).to_have_attribute("aria-pressed", "true")
    result.get_by_role("tab", name="按原子" if zh else "By atom").click()
    expect(panel.get_by_role("table", name="原子面积" if zh else "Atom areas")).to_be_visible()
    atom = panel.get_by_role("columnheader", name="原子" if zh else "Atom", exact=True)
    assert atom.locator(".column-sort").evaluate("""el => {
        const range = document.createRange();
        range.selectNodeContents(el.firstChild);
        return range.getClientRects().length === 1;
    }""")
    assert panel.locator(".research-table-scroll").evaluate(
        "el => el.scrollWidth <= el.clientWidth + 1"
    )


def verify_expansion(result, frame, canvas, zh):
    handle = frame.element_handle()
    assert handle
    expand = result.get_by_role(
        "button", name="展开研究工作区" if zh else "Expand research workspace", exact=True,
    )
    expand.click()
    expect(result.locator(".structure-workbench")).to_have_attribute(
        "data-workspace-expanded", "true"
    )
    box = frame.bounding_box()
    assert box and box["width"] > canvas["width"]
    result.get_by_role(
        "button", name="关闭展开视图" if zh else "Close expanded view", exact=True,
    ).press("Escape")
    expect(expand).to_be_focused()
    assert handle.evaluate("frame => frame.isConnected")
    return box["width"]


def verify_downloads(page, result, expected, output, directory):
    page.evaluate("window.scrollTo(0, 0)")
    links = result.locator(".spatial-summary-downloads a[download]")
    expect(links).to_have_count(expected)
    downloads = {}
    for link in links.all():
        expect(link).to_be_in_viewport()
        name = parse_qs(urlparse(link.get_attribute("href")).query)["name"][0]
        assert Path(name).name == name
        source = (output / name).read_bytes()
        with page.expect_download() as transfer:
            link.click()
        path = directory / name
        transfer.value.save_as(path)
        data = path.read_bytes()
        assert data and data == source
        downloads[name] = hashlib.sha256(data).hexdigest()
    return downloads


@pytest.mark.parametrize(("language", "theme", "width", "height"), [
    ("en", "warm", 1280, 720), ("zh", "light", 1600, 900),
])
def test_retained_spatial_workspace(language, theme, width, height):
    zh = language == "zh"
    directory = EVIDENCE / language
    directory.mkdir(parents=True, exist_ok=True)
    settings = Settings.from_env()
    with (
        platform(settings.state_dir, directory / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(f"""localStorage.setItem('opendde-workbench.language', '{language}');
            localStorage.setItem('x-dde-theme', '{theme}');
        """)
        writes, errors, checked = [], [], {}

        def record(request):
            if request.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in request.url:
                writes.append(request.url)

        page.context.on("request", record)
        page.on("pageerror", lambda error: errors.append(str(error)))
        power_url = base + "/api/runtime-controls?include_native=false"
        before = page.request.get(power_url).json()
        for capability, selector, count in CASES:
            pin = page.request.get(f"{base}/api/examples/{capability}?profile=stat6").json()["pin"]
            job = pin["job_id"]
            native = page.request.get(f"{base}/api/jobs/{job}/result").json()
            result = page.locator(selector)
            frame = result.locator(".molecular-stage iframe")
            case = directory / capability
            case.mkdir(exist_ok=True)
            page.goto(f"{base}/#task={job}")
            capture = result.get_by_role(
                "button", name="生成三维视图图片" if zh else "Capture 3D view", exact=True,
            )
            expect(capture).to_be_enabled(timeout=30000)
            expect(page.locator("html")).to_have_attribute("data-theme", theme)
            canvas = layout(page, result, width, height)
            page.screenshot(path=case / "workspace.png")
            if capability == "apbs.potential":
                verify_apbs(page, result, frame, zh)
            elif capability == "caver.paths":
                verify_channel(result, zh, native)
            else:
                verify_exposure(result, zh, native)
            expanded = verify_expansion(result, frame, canvas, zh)
            files = verify_downloads(
                page, result, count, settings.state_dir / "jobs" / job / "output", case,
            )
            if not zh:
                figure = export_figure(
                    page, result.locator(".viewer-panel .figure-export-trigger"), case,
                    "structure", language,
                )
                inspect_png(figure)
                if capability == "caver.paths":
                    profile = export_figure(
                        page, result.locator(".channel-profile .figure-export-trigger"), case,
                        "radius-profile", language, format="SVG",
                    )
                    inspect_svg(profile, "Sampled polyline distance")
            checked[capability] = {"canvas": canvas, "expanded": expanded, "downloads": files}
        assert page.request.get(power_url).json() == before
        assert not writes and not errors, {"writes": writes, "errors": errors}
        assert all(not engine["enabled"] and not engine["active"] for engine in before["engines"])
        (directory / "acceptance.json").write_text(
            json.dumps(checked, indent=2), encoding="utf-8",
        )
        browser.close()
