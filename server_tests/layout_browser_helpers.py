"""DOM geometry checks for task pages, independent of scientific runtimes."""

import json
import os
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from depiction_browser_helpers import settle_visible_drawings
from layout_template_choices import choose_template_objective
from playwright.sync_api import expect

from opendde_workbench.capabilities.definitions import CAPABILITIES

VISIBLE_TASKS = sum(
    bool(spec.frontend_form) and key != "resources" for key, spec in CAPABILITIES.items()
)
# Exact Chinese identities from studio/research-modules.ts, in catalogue order.
RESEARCH_MODULE_LABELS = (
    "靶点研究",
    "结构预测",
    "口袋与对接",
    "小分子设计",
    "诱导邻近设计",
    "高通量筛选",
    "DEL 研究",
    "生物药研究",
    "性质与安全性",
    "动力学与 FEP",
)


def expect_layout_identities(elements, labels):
    """Reject missing, duplicated, reordered or unexpected catalogue controls."""
    assert len(labels) == len(set(labels))
    expect(elements).to_have_count(len(labels))
    for index, label in enumerate(labels):
        expect(elements.nth(index)).to_have_attribute("aria-label", label)


def settle_responsive_layout(page):
    """Wait for the app's compact navigation and selected markers, not page fit."""
    ready = page.wait_for_function(
        """() => {
        // NavigationFrame commits this control after its media-query change event.
        const compact=matchMedia('(max-width: 960px)').matches;
        if (!!document.querySelector('.mobile-navigation-trigger')!==compact) return false;
        return [...document.querySelectorAll(
            '.questionnaire-steps,.research-tab-list,.task-model-switch'
        )].every(parent => {
            const outer=parent.getBoundingClientRect();
            if (!(outer.width>0 && outer.height>0) ||
                getComputedStyle(parent).visibility==='hidden') return true;
            const active=parent.querySelector(
                ':scope > button[aria-selected="true"],'+
                ':scope > button[aria-current="step"],'+
                ':scope > button[aria-pressed="true"]'
            );
            const marker=parent.querySelector(':scope > .active-control-indicator');
            if (!active) return !marker;
            const inner=active.getBoundingClientRect();
            if (!(inner.width>0)) return !marker;
            if (!marker || !marker.style.transform || !marker.style.width) return false;
            const target=new DOMMatrixReadOnly(marker.style.transform);
            // ActiveIndicator.tsx deliberately retains changes smaller than 0.25px.
            const close=(actual,expected) => Math.abs(actual-expected)<0.25;
            return close(target.m41,inner.left-outer.left+parent.scrollLeft) &&
                close(target.m42,inner.bottom-outer.top+parent.scrollTop-2) &&
                close(parseFloat(marker.style.width),inner.width) &&
                !marker.getAnimations().some(a => a.pending || a.playState==='running');
        });
        }""",
        polling="raf",
        timeout=5000,
    )
    ready.dispose()


def settle_responsive_plot(page, chart):
    """Observe Plotly's real autosize completion without invoking a redraw."""
    node = chart.element_handle()
    assert node is not None
    try:
        ready = page.wait_for_function(
            """node => {
                const width=parseFloat(getComputedStyle(node).width);
                // Plotly autosize retains <=1px deltas; its pending resize promise
                // is cleared only after relayout completes. aria-busy is data-only.
                return node.isConnected && width>0 && node._fullLayout &&
                    Math.abs(node._fullLayout.width-width)<=1 && !node._resolveResize;
            }""",
            arg=node,
            polling="raf",
            timeout=5000,
        )
        ready.dispose()
    finally:
        node.dispose()


def viewport_overflow_evidence(page, evidence, label):
    """Return the immediate predicate; failure-only observations cannot turn it into a pass."""
    probe = page.evaluate_handle("""() => {
        const box = e => {
            const r=e.getBoundingClientRect(), s=getComputedStyle(e);
            return {tag:e.tagName,cls:String(e.className),role:e.getAttribute('role'),
                label:e.getAttribute('aria-label'),parentClass:String(e.parentElement?.className),
                parentOverflowX:e.parentElement ?
                    getComputedStyle(e.parentElement).overflowX : null,
                x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,
                clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,
                overflowX:s.overflowX,minWidth:s.minWidth,transform:s.transform};
        };
        const snapshot = () => {
            const width=innerWidth, scrollWidth=document.documentElement.scrollWidth;
            return {time:performance.now(),width,height:innerHeight,scrollWidth,
                overflow:scrollWidth>width+1,
                animations:document.getAnimations().slice(0,30).map(a=>({
                    state:a.playState,time:a.currentTime,
                    duration:a.effect?.getComputedTiming().duration,
                    target:a.effect?.target ? box(a.effect.target) : null})),
                relevant:[...document.querySelectorAll('.active-control-indicator,'+
                    '.js-plotly-plot,.campaign-material-layout,.campaign-material-layout table,'+
                    '.sequence-track')].slice(0,30).map(box),
                offenders:scrollWidth>width+1 ? [...document.querySelectorAll('body *')]
                    .map(box).filter(r=>r.width>0&&r.height>0&&r.right>width+1).slice(0,30) : []};
        };
        const original={time:performance.now(),width:innerWidth,height:innerHeight,
            scrollWidth:document.documentElement.scrollWidth};
        original.overflow=original.scrollWidth>original.width+1;
        if(!original.overflow) return {original};
        const initialSnapshot=snapshot();
        const finished=new Promise(resolve=>{
            const frames=[];
            let stopped=false;
            const finish=()=>{stopped=true;resolve(frames);};
            // A diagnostic deadline also bounds throttled RAF; it never affects acceptance.
            const deadline=setTimeout(finish,1500);
            const sample=()=>{
                if(stopped) return;
                frames.push(snapshot());
                // Observation budget only, never an acceptance wait or changed tolerance.
                if(frames.length>=90) {clearTimeout(deadline);finish();}
                else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        });
        return {original,initialSnapshot,finished};
    }""")
    try:
        original = probe.evaluate("value => value.original")
        if not original["overflow"]:
            return False
        evidence.mkdir(parents=True, exist_ok=True)
        name = "overflow-" + re.sub(r"[^\w.-]", "-", label)[:90]
        report = {
            "original": original,
            "initial_snapshot": probe.evaluate("value => value.initialSnapshot"),
            "screenshot_note": (
                "Captures follow the original snapshot and may span animation frames."
            ),
            "diagnostic_errors": [],
        }
        try:
            page.screenshot(path=str(evidence / (name + "-immediate.png")), timeout=5000)
        except Exception as error:
            report["diagnostic_errors"].append(str(error))
        try:
            report["frames"] = probe.evaluate("async value => await value.finished")
            page.screenshot(path=str(evidence / (name + "-observed.png")), timeout=5000)
        except Exception as error:
            report["diagnostic_errors"].append(str(error))
        (evidence / (name + ".json")).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return original["overflow"]
    finally:
        probe.dispose()


def initialize_layout_language(page):
    """Start Chinese layout fixtures without overriding a saved language choice."""
    page.add_init_script("""if (localStorage.getItem('opendde-workbench.language') === null) {
        localStorage.setItem('opendde-workbench.language', 'zh');
    }""")


def archive_example_url(url):
    """Select the real retained-case API without replacing an explicit profile."""
    parts = urlsplit(url)
    if parts.path != "/api/examples" and not parts.path.startswith("/api/examples/"):
        raise ValueError("Only example endpoints belong to the archived layout fixture.")
    query = parse_qsl(parts.query, keep_blank_values=True)
    profiles = [value for key, value in query if key == "profile"]
    if any(value != "archive" for value in profiles):
        raise ValueError("An explicit example profile must not be silently replaced.")
    if not profiles:
        query.append(("profile", "archive"))
    return urlunsplit(parts._replace(query=urlencode(query)))


def initialize_layout_page(page, case_profile=None):
    """Choose real study or archive endpoints; never synthesize example responses."""
    initialize_layout_language(page)
    base = os.environ["WB_BROWSER_URL"].rstrip("/")
    selection = case_profile if case_profile is not None else {"profile": "archive"}

    def route_case(route):
        if selection["profile"] == "archive":
            route.continue_(url=archive_example_url(route.request.url))
        elif selection["profile"] == "stat6":
            route.continue_()
        else:
            raise ValueError("Choose a real STAT6 or archive case profile.")

    page.route(
        re.compile(r"^" + re.escape(base) + r"/api/examples(?:[/?]|$)"),
        route_case,
    )


def layout_navigation(page):
    """Open the responsive drawer through the same control as a researcher."""
    if page.viewport_size["width"] <= 960:
        trigger = page.get_by_role("button", name="打开研究导航", exact=True)
        expect(trigger).to_be_visible()
        if trigger.get_attribute("aria-expanded") != "true":
            trigger.click()
    navigation = page.get_by_role("navigation", name="主导航", exact=True)
    expect(navigation).to_be_visible()
    return navigation


def catalog(page):
    layout_navigation(page).get_by_role(
        "button", name="全部能力", exact=True
    ).click()
    expect(page.locator(".tool-card")).to_have_count(VISIBLE_TASKS)
    for summary in page.locator(".capability-additional > summary").all():
        summary.click()


def capture(page, evidence, name, stage):
    settle_visible_drawings(page)
    panels = page.locator("main .questionnaire > fieldset:visible")
    assert panels.count() <= 1, f"{name}: more than one question page visible"
    measurements = page.evaluate(
        """() => ({width:innerWidth,
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            panels:[...document.querySelectorAll('main .questionnaire,main .module-template')]
                .filter(e=>e.getBoundingClientRect().height>0)
                .map(e=>({kind:e.className,x:e.getBoundingClientRect().x,
                    width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})
        """
    )
    if measurements["overflow"]:
        page.screenshot(path=str(evidence / "layout-overflow.jpg"), type="jpeg", quality=85)
        debug = page.evaluate(
            """() => [...document.querySelectorAll('main *')]
                .map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,
                    width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))
                .filter(e=>e.width>0 && e.right>innerWidth+1).slice(0,30)"""
        )
        (evidence / "layout-overflow.json").write_text(
            json.dumps(
                {"module": name, "stage": stage, **measurements, "overflow_elements": debug},
                ensure_ascii=False,
                indent=2,
            )
        )
    assert not measurements["overflow"], f"{name} {stage}: horizontal page overflow"
    surfaces = flat_surface_styles(page)
    assert not surfaces["framed"], f"{name} {stage}: nested decorative frames {surfaces['framed']}"
    if panels.count():
        form = page.locator("main .questionnaire:visible").bounding_box()
        template = page.locator("main .module-template:visible").bounding_box()
        if template:
            assert (
                abs(form["x"] - template["x"]) <= 2 and abs(form["width"] - template["width"]) <= 2
            ), f"{name}: task and template widths differ"
        actions = page.locator(".questionnaire-actions:visible").bounding_box()
        if actions:
            assert (
                actions["x"] >= form["x"] - 1
                and actions["x"] + actions["width"] <= form["x"] + form["width"] + 1
            )
    safe = "".join(c if c.isalnum() else "-" for c in name)[:70]
    filename = f"{measurements['width']}-{safe}-{stage}.jpg"
    page.screenshot(path=str(evidence / filename), type="jpeg", quality=75, full_page=False)
    return {
        "module": name,
        "stage": stage,
        "screenshot": filename,
        "flat_surfaces": surfaces["count"],
        **measurements,
    }


def flat_surface_styles(page):
    """Read real styles while retaining functional inputs, focus rings and popovers."""
    return page.evaluate("""() => {
        const selectors = '.questionnaire,.studio-panel,.panel,.tool-form,.setup-card,' +
            '.management-card,.molecular-preview,.research-table,.result-section-card,' +
            '.result-summary-grid>div,.sequence-track,.sequence-alignment,' +
            '.module-example-result,.receptor-input,.capability-group,' +
            '.component-card,.research-candidate,.molecular-state-card,' +
            '.project-list,.research-graph-scroll,.molecular-stage,' +
            '.module-task-picker,.workspace-tabs,.workspace-tabs>button';
        const nodes = [...document.querySelectorAll('main ' + selectors.split(',').join(',main '))]
            .filter(e => e.getBoundingClientRect().height>0 &&
                !e.closest('dialog,.component-removal'));
        const framed = nodes.map(e => {
            const s=getComputedStyle(e);
            return {class:e.className, border:[s.borderTopWidth,s.borderRightWidth,
                s.borderBottomWidth,s.borderLeftWidth], radius:s.borderTopLeftRadius,
                shadow:s.boxShadow};
        }).filter(s => s.border.every(v=>parseFloat(v)>0) ||
            parseFloat(s.radius)>0 || s.shadow!=='none');
        return {count:nodes.length, framed};
    }""")


def load_template(page):
    button = page.get_by_role("button", name="使用此模板", exact=True)
    expect(button).to_be_visible(timeout=15000)
    button.click()
    expect(page.get_by_role("button", name="新建空白任务", exact=True)).to_be_visible(timeout=30000)


def consent_on_current_page(page):
    # These choices only prepare the form. No task or external query is submitted.
    for checkbox in page.locator(".questionnaire > fieldset:visible input[type=checkbox]").all():
        label = checkbox.evaluate("e => e.closest('label')?.innerText ?? ''")
        if any(term in label for term in ("允许", "确认", "同一坐标", "同一参照")):
            checkbox.check()


def review_steps(page, evidence, name):
    rows = []
    for stage in range(1, 5):
        choose_template_objective(page, name, stage)
        rows.append(capture(page, evidence, name, f"step-{stage}"))
        if stage == 4:
            break
        consent_on_current_page(page)
        button = page.get_by_role("button", name="下一步", exact=True)
        if button.count() != 1 or not button.is_enabled():
            break
        before = page.locator(".questionnaire-heading:visible").inner_text()
        button.click()
        expect(page.locator(".questionnaire-heading:visible")).not_to_have_text(before)
    return rows


def capture_utilities(page, evidence, width):
    """Inspect workspace utilities at the same actual viewport as their task group."""
    page.set_viewport_size({"width": width, "height": 1000})
    rows = []
    nav = layout_navigation(page)
    # navigation-model.ts appends these two utilities to the research modules.
    expect_layout_identities(
        nav.get_by_role("button"),
        (*RESEARCH_MODULE_LABELS, "研究空间", "全部能力"),
    )
    nav.get_by_role("button", name="研究空间", exact=True).click()
    for tab in ("项目", "研究文件", "结构编辑"):
        page.get_by_role("group", name="研究空间", exact=True).get_by_role(
            "button", name=tab, exact=True
        ).click()
        rows.append(capture(page, evidence, "研究空间-" + tab, "utility"))
        if tab == "项目":
            page.locator(".project-toolbar .primary-button").click()
            dialog = page.get_by_role("dialog", name="新建项目", exact=True)
            expect(dialog).to_be_visible()
            expect(page.get_by_role("textbox", name="项目名称", exact=True)).to_be_focused()
            confirm = dialog.locator("footer .primary-button").bounding_box()
            bounds = dialog.bounding_box()
            assert confirm["width"] < bounds["width"] * 0.6
            rows.append(capture(page, evidence, "研究项目", "create-dialog"))
            page.get_by_role("button", name="取消", exact=True).click()
    layout_navigation(page).get_by_role("button", name="口袋与对接", exact=True).click()
    page.get_by_role("navigation", name="模块工作区", exact=True).get_by_role(
        "button", name="任务结果", exact=True
    ).click()
    rows.append(capture(page, evidence, "口袋与对接-任务结果", "utility"))
    for label in ("安装与运行", "界面设置", "使用帮助"):
        layout_navigation(page)
        page.get_by_role("button", name="设置与帮助", exact=True).click()
        expect(page.get_by_role("menuitem")).to_have_count(3)
        page.get_by_role("menuitem", name=label, exact=True).click()
        rows.append(capture(page, evidence, label, "utility"))
        if label == "安装与运行":
            page.get_by_role("group", name="安装与运行", exact=True).get_by_role(
                "button", name="运行状态", exact=True
            ).click()
            rows.append(capture(page, evidence, "运行状态", "utility"))
    return rows


def save_report(evidence, rows, errors, selection=None):
    (evidence / "layout-matrix.json").write_text(
        json.dumps(
            {"pages": rows, "errors": errors, "selection": selection},
            ensure_ascii=False,
            indent=2,
        )
    )
