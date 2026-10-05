"""Generated raster backgrounds and orderly entry/questionnaire surfaces across every module."""

import json
import os
from pathlib import Path

from layout_browser_helpers import catalog, flat_surface_styles
from playwright.sync_api import expect, sync_playwright


def test_all_module_backgrounds_and_questionnaire_surfaces():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    errors, pages = [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.environ["WB_BROWSER_URL"])
        groups = page.locator(".capability-group")
        expect(groups).to_have_count(6)
        dimensions = groups.evaluate_all(
            """elements => elements.map(e => ({theme:e.dataset.moduleTheme,
                width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))"""
        )
        assert max(r["height"] for r in dimensions) - min(r["height"] for r in dimensions) < 2
        assert min(r["width"] for r in dimensions) > 280
        assert not flat_surface_styles(page)["framed"]
        expect(page.get_by_role("navigation", name="研究阶段快捷入口")).to_be_visible()
        assert page.evaluate("""async () => new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(image.naturalWidth > 1000 && image.naturalHeight > 300);
            image.onerror = () => resolve(false);
            image.src = '/images/modules/ambient-ai.webp';
        })""")
        contrast = page.evaluate("""() => {
            const style=getComputedStyle(document.documentElement);
            const canvas=document.createElement('canvas');
            canvas.width=canvas.height=1;
            const context=canvas.getContext('2d');
            const luminance=color=>{
                if(!CSS.supports('color',color.trim()))
                    throw new Error('Invalid color token: '+color);
                context.clearRect(0,0,1,1);
                context.fillStyle=color.trim();
                context.fillRect(0,0,1,1);
                const pixel=context.getImageData(0,0,1,1).data;
                if(pixel[3]!==255) throw new Error('Contrast colors must be opaque');
                const channels=[...pixel].slice(0,3).map(c=>c/255)
                    .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
                return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
            };
            const ratio=(a,b)=>(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
            const bg=luminance(style.getPropertyValue('--surface'));
            const text=['--ink','--muted','--accent'].map(name=>
                ratio(luminance(style.getPropertyValue(name)),bg));
            const button=luminance(style.getPropertyValue('--accent-contrast'));
            return {text,primary:['--accent','--accent-secondary'].map(name=>
                ratio(luminance(style.getPropertyValue(name)),button))};
        }""")
        assert min([*contrast["text"], *contrast["primary"]]) >= 4.5, contrast
        assert page.evaluate("""async () => {
            const themes=['targets','structures','docking','molecules',
              'biologics','properties','research','environments'];
            return (await Promise.all(themes.map(theme => new Promise(resolve => {
              const image=new Image();
              image.onload=()=>resolve(image.naturalWidth>1000&&image.naturalHeight>300);
              image.onerror=()=>resolve(false); image.src='/images/modules/'+theme+'.webp';
            })))).every(Boolean);
        }""")
        page.screenshot(path=str(evidence / "generated-module-backgrounds.png"))
        catalog(page)
        names = [card.get_attribute("aria-label") for card in page.locator(".tool-card").all()]
        assert len(names) == len(set(names)) == 44
        for name in names:
            catalog(page)
            page.get_by_role("button", name=name, exact=True).click()
            theme = page.locator("main").get_attribute("data-module-theme")
            assert theme in {
                "targets",
                "structures",
                "docking",
                "molecules",
                "biologics",
                "properties",
                "environments",
            }
            assert page.locator(".questionnaire > fieldset:visible").count() <= 1
            assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1"), name
            questionnaire = page.locator(".questionnaire:visible")
            if questionnaire.count():
                form_box = questionnaire.bounding_box()
                main_box = page.locator("main").bounding_box()
                assert form_box["width"] >= main_box["width"] * 0.9, name
                assert page.locator(".questionnaire-page-mark:visible").count() == 0
                body = page.locator(".questionnaire > fieldset:visible").bounding_box()
                footer = page.locator(".questionnaire-actions:visible").bounding_box()
                if body and footer:
                    assert footer["y"] - (body["y"] + body["height"]) <= 80, name
            surfaces = flat_surface_styles(page)
            assert not surfaces["framed"], (name, surfaces)
            editable = page.locator(
                ".questionnaire > fieldset:visible "
                ":is(input,textarea):visible:enabled:not([type=hidden])"
            )
            if editable.count():
                page.keyboard.press("Tab")
                editable.first.focus()
                expect(editable.first).to_be_focused()
                assert editable.first.evaluate("e=>getComputedStyle(e).outlineStyle") != "none"
            pages.append({"module": name, "theme": theme, "flat_surfaces": surfaces["count"]})
        page.set_viewport_size({"width": 720, "height": 1100})
        catalog(page)
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        page.screenshot(path=str(evidence / "generated-module-backgrounds-compact.png"))
        assert not errors, errors
        (evidence / "module-surface-acceptance.json").write_text(
            json.dumps(
                {
                    "images": 8,
                    "ambient_image": True,
                    "contrast": contrast,
                    "modules": pages,
                    "entry_geometry": dimensions,
                    "errors": errors,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        browser.close()
