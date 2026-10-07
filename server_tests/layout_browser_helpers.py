"""DOM geometry checks for task pages, independent of scientific runtimes."""

import json

from depiction_browser_helpers import settle_visible_drawings
from layout_template_choices import choose_template_objective
from playwright.sync_api import expect

from opendde_workbench.capabilities.definitions import CAPABILITIES

VISIBLE_TASKS = sum(
    bool(spec.frontend_form) and key != "resources" for key, spec in CAPABILITIES.items()
)


def catalog(page):
    page.get_by_role("navigation", name="主导航").get_by_role(
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
    nav = page.get_by_role("navigation", name="主导航")
    expect(nav.get_by_role("button")).to_have_count(12)
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
    nav.get_by_role("button", name="任务与结果", exact=True).click()
    rows.append(capture(page, evidence, "任务与结果", "utility"))
    for label in ("安装与运行", "界面设置", "使用帮助"):
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
