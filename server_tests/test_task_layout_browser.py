"""Walk every task module and genuine archived case in Chromium, without computation."""
import os
import sqlite3
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from layout_browser_helpers import catalog, capture, load_template, review_steps, save_report

def test_every_task_page_and_native_case_layout():
    evidence=Path("server_tests/evidence/task-layout");evidence.mkdir(parents=True,exist_ok=True)
    errors=[];rows=[];task_submissions=[]
    db=sqlite3.connect(Path(os.environ["WB_STATE_DIR"])/"jobs.sqlite3")
    original=db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()
    with sync_playwright() as engine:
        browser=engine.chromium.launch()
        page=browser.new_page(viewport={"width":1440,"height":1000})
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("request",lambda request:task_submissions.append(request.url) if request.method=="POST" and request.url.split('?')[0].endswith(("/api/jobs","/api/batches")) else None)
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            expect(page.locator(".tool-card")).to_have_count(44)
            names=page.locator(".tool-card h2").all_text_contents()
            for width in (1440,390):
                page.set_viewport_size({"width":width,"height":1000})
                for name in names:
                    catalog(page)
                    page.get_by_role("button",name=name,exact=True).click()
                    expect(page.locator(".module-template")).to_be_visible()
                    rows.append(capture(page,evidence,name,"new"))
                    # Expert fields are a separate UI state, never a launched task.
                    expert=page.get_by_role("button",name="专家模式",exact=True)
                    if expert.count()==1 and expert.is_visible():
                        expert.click();rows.append(capture(page,evidence,name,"expert"))
                        guided=page.get_by_role("button",name="简易模式",exact=True)
                        if guided.count()==1:guided.click()
                    load_template(page)
                    rows.extend(review_steps(page,evidence,name))
                    results=page.get_by_role("button",name="示例结果",exact=True)
                    if results.count()==0:results=page.get_by_role("button",name="配置示例",exact=True)
                    expect(results).to_be_visible();results.click()
                    expect(page.get_by_role("region",name="模块内示例结果",exact=True)).to_be_visible()
                    expect(page.get_by_text("正在读取结果…",exact=True)).not_to_be_visible(timeout=30000)
                    rows.append(capture(page,evidence,name,"result"))
            page.set_viewport_size({"width":1440,"height":1000})
            for label in ("研究资产","研究项目","任务记录","分子编辑"):
                page.get_by_role("navigation",name="主导航").get_by_role("button",name=label,exact=True).click()
                rows.append(capture(page,evidence,label,"utility"))
                if label=="研究项目":
                    page.locator(".project-toolbar .primary-button").click()
                    dialog=page.get_by_role("dialog",name="新建项目",exact=True)
                    expect(dialog).to_be_visible()
                    expect(page.get_by_role("textbox",name="项目名称",exact=True)).to_be_focused()
                    confirm=dialog.locator("footer .primary-button").bounding_box()
                    bounds=dialog.bounding_box()
                    assert confirm["width"] < bounds["width"]*.6
                    rows.append(capture(page,evidence,label,"create-dialog"))
                    page.get_by_role("button",name="取消",exact=True).click()
            page.get_by_role("button",name="账户与设置",exact=True).click()
            menu=("账户与设置","结果解读","导出结果","工作空间概况","安装与组件","运行状态","帮助中心")
            for label in menu:
                if not page.get_by_role("menuitem",name=label,exact=True).count():page.get_by_role("button",name="账户与设置",exact=True).click()
                page.get_by_role("menuitem",name=label,exact=True).click()
                rows.append(capture(page,evidence,label,"utility"))
            assert not errors, errors
            assert not task_submissions, "A layout check must never submit science tasks"
            assert db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()==original
        finally:
            save_report(evidence,rows,errors)
            browser.close();db.close()
