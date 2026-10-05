"""Generated raster backgrounds and orderly entry/questionnaire surfaces across every module."""

import json
import os
from pathlib import Path

from layout_browser_helpers import catalog
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
            "elements => elements.map(e => ({theme:e.dataset.moduleTheme,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))"
        )
        assert max(r["height"] for r in dimensions) - min(r["height"] for r in dimensions) < 2
        assert min(r["width"] for r in dimensions) > 280
        assert page.evaluate("""async () => {
            const themes=['targets','structures','docking','molecules','biologics','properties','research','environments'];
            return (await Promise.all(themes.map(theme => new Promise(resolve => {
              const image=new Image(); image.onload=()=>resolve(image.naturalWidth>1000&&image.naturalHeight>300);
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
            pages.append({"module": name, "theme": theme})
        page.set_viewport_size({"width": 720, "height": 1100})
        catalog(page)
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        page.screenshot(path=str(evidence / "generated-module-backgrounds-compact.png"))
        assert not errors, errors
        (evidence / "module-surface-acceptance.json").write_text(
            json.dumps(
                {"images": 8, "modules": pages, "entry_geometry": dimensions, "errors": errors},
                ensure_ascii=False,
                indent=2,
            )
        )
        browser.close()
