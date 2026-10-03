"""DOM geometry checks for task pages, independent of scientific runtimes."""
import json
from pathlib import Path
from playwright.sync_api import expect

def catalog(page):
    page.get_by_role("navigation",name="主导航").get_by_role("button",name="全部能力",exact=True).click()
    expect(page.locator(".tool-card")).to_have_count(44)

def capture(page, evidence, name, stage):
    panels=page.locator("main .questionnaire > fieldset:visible")
    assert panels.count()<=1, f"{name}: more than one question page visible"
    measurements=page.evaluate("""() => ({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,panels:[...document.querySelectorAll('main .questionnaire,main .module-template')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({kind:e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})""")
    assert not measurements["overflow"], f"{name} {stage}: horizontal page overflow"
    if panels.count():
        form=page.locator("main .questionnaire:visible").bounding_box()
        template=page.locator("main .module-template:visible").bounding_box()
        if template:
            assert abs(form["x"]-template["x"])<=2 and abs(form["width"]-template["width"])<=2, f"{name}: task and template widths differ"
        actions=page.locator(".questionnaire-actions:visible").bounding_box()
        if actions:
            assert actions["x"]>=form["x"]-1 and actions["x"]+actions["width"]<=form["x"]+form["width"]+1
    safe="".join(c if c.isalnum() else "-" for c in name)[:70]
    filename=f"{measurements['width']}-{safe}-{stage}.jpg"
    page.screenshot(path=str(evidence/filename),type="jpeg",quality=75,full_page=False)
    return {"module":name,"stage":stage,"screenshot":filename,**measurements}

def load_template(page):
    button=page.get_by_role("button",name="使用此模板",exact=True)
    expect(button).to_be_visible(timeout=15000)
    button.click()
    expect(page.get_by_role("button",name="新建空白任务",exact=True)).to_be_visible(timeout=30000)

def consent_on_current_page(page):
    # These choices only prepare the form. No task or external query is submitted.
    for checkbox in page.locator(".questionnaire > fieldset:visible input[type=checkbox]").all():
        label=checkbox.evaluate("e => e.closest('label')?.innerText ?? ''")
        if any(term in label for term in ("允许", "确认", "同一坐标", "同一参照")):
            checkbox.check()

def review_steps(page,evidence,name):
    rows=[]
    for stage in range(1,5):
        rows.append(capture(page,evidence,name,f"step-{stage}"))
        if stage==4:break
        consent_on_current_page(page)
        button=page.get_by_role("button",name="下一步",exact=True)
        if button.count()!=1 or not button.is_enabled():break
        before=page.locator(".questionnaire-heading:visible").inner_text()
        button.click()
        expect(page.locator(".questionnaire-heading:visible")).not_to_have_text(before)
    return rows

def save_report(evidence,rows,errors):
    (evidence/"layout-matrix.json").write_text(json.dumps({"pages":rows,"errors":errors},ensure_ascii=False,indent=2))
