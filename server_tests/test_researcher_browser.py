"""Researcher decisions use actual archived results; no inference or new research jobs."""
import json
import os
import re
import sqlite3
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from layout_browser_helpers import catalog

def test_researcher_result_decisions_and_handoffs():
    evidence=Path("server_tests/evidence/task-layout");evidence.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(Path(os.environ["WB_STATE_DIR"])/"jobs.sqlite3")
    before=db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()
    errors=[];submitted=[];steps=[]
    with sync_playwright() as driver:
        browser=driver.chromium.launch()
        page=browser.new_page(viewport={"width":1440,"height":1000})
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("request",lambda request:submitted.append(request.url) if request.method=="POST" and request.url.split("?")[0].endswith(("/api/jobs","/api/batches")) else None)
        page.goto(os.environ["WB_BROWSER_URL"])
        def result(name):
            catalog(page);page.get_by_role("button",name=name,exact=True).click()
            page.locator(".module-template:visible").get_by_role("button",name="示例结果",exact=True).click()
            expect(page.get_by_text("正在读取结果…",exact=True)).not_to_be_visible(timeout=30000)
        def record(name):
            text=page.locator("main").inner_text()
            assert "/srv/" not in text and "/opt/" not in text and "server_url" not in text and "job_id" not in text
            page.screenshot(path=str(evidence/("researcher-"+name+".jpg")),type="jpeg",quality=85)
            steps.append(name)
        try:
            result("发现多个候选口袋")
            expect(page.get_by_text(re.compile(r"已定位区域残基：\s*17\s*/\s*17"))).to_be_visible(timeout=30000)
            record("pocket-1")
            page.locator(".pocket-result-list button").nth(1).click()
            expect(page.get_by_text(re.compile(r"已定位区域残基：\s*8\s*/\s*8"))).to_be_visible(timeout=30000)
            record("pocket-2")
            page.get_by_role("button",name="用这个口袋生成分子",exact=True).click()
            expect(page.locator(".questionnaire > fieldset:visible")).to_have_count(1)
            expect(page.get_by_role("button",name="下一步",exact=True)).to_be_visible()
            expect(page.get_by_text("候选口袋: 2",exact=True)).not_to_be_visible()
            record("pocket-handoff")
            result("局部重设计")
            expect(page.get_by_text("此次没有得到符合要求的候选。",exact=False)).to_be_visible()
            expect(page.locator(".viewer-panel:visible")).to_have_count(0)
            record("zero-qualified")
            result("准备 MSA 与模板")
            link=page.get_by_role("link",name="预测输入 1 · JSON",exact=True)
            expect(link).to_be_visible()
            response=page.request.get(link.get_attribute("href"))
            assert response.status==200
            assert isinstance(response.json(),(dict,list))
            record("prepared-input")
            result("分子相互作用")
            expect(page.get_by_role("columnheader",name="距离（Å）",exact=True)).to_be_visible()
            expect(page.get_by_role("button",name="A:ASN140",exact=True)).to_be_visible()
            page.get_by_role("button",name="A:ASN140",exact=True).click()
            expect(page.locator(".viewer-panel iframe")).to_be_visible()
            record("interactions")
            result("蛋白序列评分")
            expect(page.get_by_text("序列 1",exact=True)).to_be_visible()
            expect(page.get_by_text("-0.6953",exact=True)).to_be_visible()
            record("sequence-scores")
            assert not submitted,submitted
            assert not errors,errors
            assert db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()==before
        finally:
            (evidence/"researcher-decisions.json").write_text(json.dumps({"steps":steps,"errors":errors,"submitted":submitted},ensure_ascii=False,indent=2))
            browser.close();db.close()
