"""Review the component/library layout without installing or executing any software."""

import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def card_geometry(page, selector):
    return page.locator(selector).evaluate_all("""elements => elements
      .filter(e => !e.closest('details:not([open])') && e.getBoundingClientRect().height > 0)
      .map(e => {
        const box = e.getBoundingClientRect();
        const actions = e.querySelector('.component-actions');
        const button = e.querySelector('.component-primary');
        const title = e.querySelector('h3');
        return {name: e.getAttribute('aria-label') ?? title?.textContent,
          x:box.x, y:box.y, width:box.width, height:box.height, right:box.right,
          footerBottom: actions?.getBoundingClientRect().bottom ?? box.bottom,
          buttonWidth:button?.getBoundingClientRect().width ?? 0,
          titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : false};
      })""")


def check_cards(cards, viewport):
    assert cards, "No component cards rendered"
    for card in cards:
        assert card["right"] <= viewport + 1, card
        assert 0.7 <= card["width"] / card["height"] <= 1.4, card
        assert card["footerBottom"] <= card["y"] + card["height"] - 8, card
        assert not card["titleClipped"], card
        assert card["buttonWidth"] < card["width"] * 0.65, card
    for first, second in zip(cards, cards[1:], strict=False):
        if abs(first["y"] - second["y"]) < 1:
            assert second["x"] >= first["right"] + 10, (first, second)


def test_component_cards_groups_and_runtime_desktop_mobile():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    rows, errors, mutations = [], [], []
    with sync_playwright() as engine:
        browser = engine.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"}
                and "/api/deployment/" in request.url
                else None
            ),
        )
        try:
            page.goto(os.environ["WB_BROWSER_URL"])
            page.get_by_role("button", name="设置与帮助", exact=True).click()
            page.get_by_role("menuitem", name="安装与运行", exact=True).click()
            expect(page.locator(".component-grid > .component-card:visible").first).to_be_visible()
            groups = (
                page.get_by_role("navigation", name="组件分组")
                .get_by_role("button")
                .all_text_contents()
            )
            for width in (1440, 1920, 2560, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                page.get_by_role("button", name="全部", exact=True).click()
                all_cards = card_geometry(page, ".component-grid > .component-card")
                check_cards(all_cards, width)
                assert len({card["name"] for card in all_cards}) == len(all_cards)
                for group in groups:
                    page.get_by_role("navigation", name="组件分组").get_by_role(
                        "button", name=group, exact=True
                    ).click()
                    cards = card_geometry(page, ".component-grid > .component-card")
                    check_cards(cards, width)
                    assert abs(cards[0]["width"] - all_cards[0]["width"]) <= 1, (
                        "A short group must retain the grid column width"
                    )
                    page.screenshot(
                        path=str(evidence / f"components-{width}-{groups.index(group)}.png")
                    )
                    rows.append({"width": width, "group": group, "cards": cards})
                page.get_by_role("button", name="全部", exact=True).click()
                optional = page.locator(".component-additions > summary")
                if optional.count():
                    optional.click()
                    check_cards(card_geometry(page, ".component-additions .component-card"), width)
                    page.screenshot(path=str(evidence / f"optional-components-{width}.png"))
                    optional.click()
                page.get_by_role("group", name="安装与运行").get_by_role(
                    "button", name="运行状态", exact=True
                ).click()
                expect(page.locator(".runtime-workspace .studio-panel").first).to_be_visible()
                runtime = card_geometry(page, ".runtime-workspace .studio-panel")
                # Status cards intentionally have no component maintenance footer.
                for card in runtime:
                    assert (
                        card["right"] <= width + 1 and 0.7 <= card["width"] / card["height"] <= 1.4
                    ), card
                page.screenshot(path=str(evidence / f"runtime-cards-{width}.png"))
                page.get_by_role("group", name="安装与运行").get_by_role(
                    "button", name="组件安装", exact=True
                ).click()
            assert not errors, errors
            assert not mutations, "Layout review must not alter component installations"
        finally:
            (evidence / "component-layout.json").write_text(
                json.dumps(
                    {"pages": rows, "errors": errors, "mutations": mutations},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            browser.close()
