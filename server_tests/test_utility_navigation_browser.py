"""Chrome: utility tabs stay in view through a workspace resize."""

from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/utility-navigation")
DRAFT = "CC(=O)Nc1ccc(O)cc1"


def wait_for_tab_in_view(page, selector):
    page.wait_for_function("""selector => {
      const strip = document.querySelector(".utility-tabs");
      const tab = strip.querySelector(selector);
      if (!tab) return false;
      const viewport = strip.getBoundingClientRect();
      const bounds = tab.getBoundingClientRect();
      return bounds.left >= Math.max(0, viewport.left) - 1 &&
        bounds.right <= Math.min(innerWidth, viewport.right) + 1;
    }""", arg=selector)


def expect_tab_in_view(page, strip, label):
    selected = strip.get_by_role("button", name=label, exact=True)
    expect(selected).to_have_attribute("aria-pressed", "true")
    wait_for_tab_in_view(page, 'button[aria-pressed="true"]')
    return selected


@pytest.mark.parametrize(("language", "width"), [("en", 390), ("zh", 320)])
def test_resize_keeps_current_tool_visible_and_draft_focused(tmp_path, language, width):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    chinese = language == "zh"
    states = "质子化与互变异构" if chinese else "Protonation & tautomers"
    properties = "分子性质" if chinese else "Molecular properties"
    admet = "ADMET 预测" if chinese else "ADMET prediction"
    source = (
        "粘贴分子结构文字（SMILES）" if chinese else "Paste molecular structure text (SMILES)"
    )
    with platform(tmp_path / "state", EVIDENCE / f"server-{language}.log") as base:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 1440, "height": 850})
            page.add_init_script(
                f"localStorage.setItem('opendde-workbench.language', '{language}')"
            )
            posts = []
            page.on(
                "request",
                lambda req: posts.append(req.url)
                if req.method == "POST" and req.url.startswith(f"{base}/api/")
                else None,
            )
            page.goto(f"{base}/#view=utilities")
            strip = page.locator(".utility-tabs")
            state_tab = strip.get_by_role("button", name=states, exact=True)
            state_tab.click()
            page.set_viewport_size({"width": width, "height": 850})
            expect(expect_tab_in_view(page, strip, states)).to_be_focused()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")

            page.set_viewport_size({"width": 1440, "height": 850})
            browsing = strip.get_by_role("button", name=admet, exact=True)
            browsing.focus()
            page.set_viewport_size({"width": width, "height": 850})
            wait_for_tab_in_view(page, "button:focus")
            expect(browsing).to_be_focused()
            expect(state_tab).to_have_attribute("aria-pressed", "true")

            page.set_viewport_size({"width": 1440, "height": 850})
            strip.get_by_role("button", name=properties, exact=True).click()
            form = page.locator('[data-utility="properties"]')
            form.get_by_role("radio", name=source, exact=True).check()
            draft = form.get_by_role("textbox", name="SMILES", exact=True)
            draft.fill(DRAFT)
            draft.focus()
            page.set_viewport_size({"width": width, "height": 850})
            expect_tab_in_view(page, strip, properties)
            expect(draft).to_be_focused()
            expect(draft).to_have_value(DRAFT)
            page.screenshot(path=EVIDENCE / f"focused-draft-{language}-{width}.png")

            # A user can scroll back to browse another tool without switching the draft.
            strip.evaluate("""strip => new Promise(resolve => {
              strip.scrollLeft = 0;
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            })""")
            assert strip.evaluate("strip => strip.scrollLeft") == 0
            expect(draft).to_be_focused()
            strip.get_by_role("button", name=admet, exact=True).click()
            strip.get_by_role("button", name=properties, exact=True).click()
            expect_tab_in_view(page, strip, properties)
            expect(draft).to_have_value(DRAFT)
            assert not posts
            browser.close()
