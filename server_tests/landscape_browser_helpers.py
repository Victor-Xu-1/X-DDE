"""Native chart interaction assertions shared by the actual result consumers."""

import json
import os

from playwright.sync_api import expect


def exercise_plot_view(page, panel, language, bounds=None, *, evidence):
    """Keep native interaction failures intact and retain failure-only observations."""
    observation = {"stage": "start"}
    try:
        _exercise_plot_view(page, panel, language, bounds, observation)
    except Exception as failure:
        try:
            _plot_failure_evidence(page, panel, evidence, language, observation, failure)
        except Exception as capture_failure:
            # A closed page or unwritable artifact directory must not replace the test error.
            print("Landscape failure evidence unavailable:", str(capture_failure)[:1024])
        raise


def _plot_failure_evidence(page, panel, evidence, language, observation, failure):
    evidence.mkdir(parents=True, exist_ok=True)
    stem = "landscape-pan-failure-" + ("zh" if language == "zh" else "en")
    report = {
        "revision": os.environ.get("GITHUB_SHA"),
        "failure": str(failure)[:2048],
        "observation": observation,
        "diagnostic_errors": [],
    }
    try:
        report["snapshot"] = panel.get_by_role("application").evaluate(
            """(chart, point) => {
                const rect = el => el?.getBoundingClientRect().toJSON() ?? null;
                const node = el => el ? {
                    tag: el.tagName.slice(0, 32),
                    id: (el.id || '').slice(0, 128),
                    class: (el.getAttribute('class') || '').slice(0, 256),
                    role: (el.getAttribute('role') || '').slice(0, 64),
                    rect: rect(el),
                } : null;
                const target = point ? document.elementFromPoint(...point) : null;
                const ancestors = [];
                for (let el = target; el && ancestors.length < 6; el = el.parentElement)
                    ancestors.push(node(el));
                const scroll = [];
                for (let el = chart; el && scroll.length < 8; el = el.parentElement)
                    scroll.push({...node(el), left: el.scrollLeft, top: el.scrollTop,
                        width: el.scrollWidth, height: el.scrollHeight});
                const drawing = Array.from(document.querySelectorAll(
                    '.result-inspector .molecule-image')).slice(0, 20).map(el => ({
                        ...node(el), state: el.getAttribute('data-drawing-state'),
                    }));
                const layout = chart._fullLayout;
                return {
                    viewport: {width: innerWidth, height: innerHeight,
                        scrollX, scrollY, devicePixelRatio},
                    chart: node(chart), drag: rect(chart.querySelector('.nsewdrag')),
                    hit: node(target), hitWithinChart: target ? chart.contains(target) : false,
                    hitAncestors: ancestors, scrollAncestors: scroll, drawing,
                    active: node(document.activeElement), busy: chart.getAttribute('aria-busy'),
                    native: {mode: layout?.dragmode, fixed: layout?.xaxis?.fixedrange,
                        x: layout?.xaxis?.range?.slice(0, 4),
                        y: layout?.yaxis?.range?.slice(0, 4)},
                };
            }""",
            observation.get("point"),
            timeout=2000,
        )
    except Exception as error:
        report["diagnostic_errors"].append("snapshot: " + str(error)[:1024])
    try:
        # Viewport only: bounded pixels, no scrolling, style changes or waits-to-pass.
        page.screenshot(
            path=str(evidence / (stem + ".jpg")),
            type="jpeg",
            quality=70,
            full_page=False,
            timeout=5000,
        )
        report["screenshot"] = stem + ".jpg"
    except Exception as error:
        report["diagnostic_errors"].append("screenshot: " + str(error)[:1024])
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if len(payload.encode("utf-8")) > 65536:
        report.pop("snapshot", None)
        report["diagnostic_errors"].append("snapshot omitted: 64 KiB evidence limit")
        payload = json.dumps(report, ensure_ascii=False, indent=2)
    (evidence / (stem + ".json")).write_text(payload, encoding="utf-8")


def _exercise_plot_view(page, panel, language, bounds, observation):
    chart = panel.get_by_role("application")
    observation["stage"] = "select-pan"
    panel.get_by_role(
        "combobox", name="Chart interaction" if language == "en" else "图表操作"
    ).select_option("pan")
    expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
    page.wait_for_function("el => el._fullLayout?.dragmode === 'pan'", arg=chart.element_handle())
    observation["stage"] = "scroll-chart"
    chart.evaluate("el => el.scrollIntoView({block:'center',inline:'nearest'})")
    page.wait_for_function(
        "el => {const box=el.getBoundingClientRect(); return box.top>=68 && box.bottom<=innerHeight;}",
        arg=chart.element_handle(),
    )
    observation["stage"] = "measure-drag"
    original = chart.evaluate("el => ({x:el.data[0].x,y:el.data[0].y})")
    before = chart.evaluate("el => el._fullLayout.xaxis.range")
    drag = chart.locator(".nsewdrag").bounding_box()
    observation["measured_drag"] = drag
    observation["before"] = before
    assert drag
    x, y = drag["x"] + drag["width"] * 0.4, drag["y"] + drag["height"] * 0.5
    observation["point"] = [x, y]
    observation["stage"] = "hit-test"
    assert chart.evaluate(
        "(el,point) => el.contains(document.elementFromPoint(point[0],point[1]))", [x, y]
    ), "The native chart pan target must be visible and unobscured."
    observation["stage"] = "drag"
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + drag["width"] * 0.2, y, steps=10)
    during = chart.evaluate("el=>el._fullLayout.xaxis.range")
    page.mouse.up()
    observation["during"] = during
    observation["stage"] = "pan-range"
    page.wait_for_function(
        """({chart,before}) => {
      return chart?._fullLayout.xaxis.range.some(
        (value,index)=>Math.abs(value-before[index])>1e-10);
    }""",
        arg={"chart": chart.element_handle(), "before": before},
    )
    assert chart.evaluate("el => ({x:el.data[0].x,y:el.data[0].y})") == original
    observation["stage"] = "reset"
    panel.get_by_role("button", name="Reset" if language == "en" else "重置", exact=True).click()
    expected = bounds if bounds is not None else before
    page.wait_for_function(
        """({chart,expected}) => {
      return chart?._fullLayout.xaxis.range.every(
        (value,index)=>Math.abs(value-expected[index])<1e-7);
    }""",
        arg={"chart": chart.element_handle(), "expected": expected},
    )


def choose_native_point(page, chart, index):
    point = chart.locator(".scatterlayer .point").nth(index)
    point.scroll_into_view_if_needed()
    expect(chart).to_have_attribute("aria-busy", "false", timeout=30000)
    box = point.bounding_box()
    assert box
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    expect(chart.locator(".hoverlayer .hovertext")).to_be_visible()
    page.mouse.click(x, y)


def responsive_landscape(page, panel, evidence, language):
    for width in (2560, 1440, 768, 390):
        page.set_viewport_size({"width": width, "height": 1000})
        page.wait_for_function("() => document.documentElement.scrollWidth <= innerWidth + 1")
        panel.scroll_into_view_if_needed()
        page.screenshot(path=str(evidence / f"{language}-{width}.png"), full_page=True)
        page.screenshot(path=str(evidence / f"{language}-{width}-viewport.png"))
