"""Inspect the bounded native sidechain selector without starting another model."""

import json

from playwright.sync_api import expect


def inspect_questionnaire(page, base, source, pair, zh, root, before, confirm):
    language = "zh" if zh else "en"
    # Inspect the actual sidechain selector without dispatching another model.
    page.goto(base + "/#view=new&tool=gnina.minimize")
    history = "历史文件" if zh else "Historical files"
    page.get_by_role("radio", name=history, exact=True).nth(0).check()
    find = page.get_by_role(
        "searchbox", name="查找历史材料" if zh else "Find historical inputs", exact=True
    )
    find.fill("184l-heavy-receptor")
    receptor_picker = page.get_by_role(
        "combobox",
        name=("受体结构 · 历史文件" if zh else "Receptor structure · Historical files"),
        exact=True,
    )
    expect(
        receptor_picker.locator('option[value="file:' + source["asset_id"] + '"]')
    ).to_have_count(1)
    receptor_picker.select_option("file:" + source["asset_id"])
    page.get_by_role("radio", name=history, exact=True).nth(1).check()
    page.get_by_role(
        "searchbox", name="查找历史材料" if zh else "Find historical inputs", exact=True
    ).nth(1).fill("pose-001.sdf")
    ligand_picker = page.get_by_role(
        "combobox",
        name=(
            "选择分子或已有姿势 · 历史文件"
            if zh
            else "Choose a molecule or existing pose · Historical files"
        ),
        exact=True,
    )
    expect(
        ligand_picker.locator('option[value="version:' + pair["ligand"]["version_id"] + '"]')
    ).to_have_count(1)
    ligand_picker.select_option("version:" + pair["ligand"]["version_id"])
    next_button = page.get_by_role("button", name="下一步" if zh else "Next", exact=True)
    next_button.click()
    page.get_by_role(
        "checkbox",
        name=("我确认参考配体/已有姿势位于所选受体的坐标系中" if zh else confirm),
        exact=True,
    ).check()
    next_button.click()
    toggle = page.get_by_role(
        "checkbox",
        name="允许所选侧链局部调整" if zh else "Allow selected sidechains to adjust",
        exact=True,
    )
    expect(toggle).not_to_be_checked()
    toggle.check()
    expect(next_button).to_be_disabled()
    selector = page.get_by_role(
        "combobox",
        name="选择需要调整的侧链" if zh else "Sidechains to adjust",
        exact=True,
    )
    expect(selector.locator("option").filter(has_text="A:VAL111")).to_have_count(1, timeout=30000)
    selector.select_option(label="A:VAL111")
    expect(next_button).to_be_enabled()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    page.screenshot(path=root / (language + "-sidechain-selector.png"), full_page=True)
    next_button.click()
    expect(page.get_by_text("A:111", exact=True)).to_be_visible()
    submit = page.get_by_role(
        "button", name="局部最小化" if zh else "Local minimization", exact=True
    )
    expect(submit).to_be_visible()

    def appearance():
        return submit.evaluate(
            """(button) => {
                const style = getComputedStyle(button);
                return {text: button.textContent, disabled: button.disabled,
                    hover: button.matches(':hover'), color: style.color,
                    background: style.backgroundColor, image: style.backgroundImage,
                    opacity: style.opacity};
            }"""
        )

    initial = appearance()
    page.mouse.move(0, 0)
    page.screenshot(
        path=root / (language + "-sidechain-review.png"), full_page=True, animations="disabled"
    )
    (root / (language + "-review-control-appearance.json")).write_text(
        json.dumps({"initial": initial, "stable": appearance()}, indent=2)
    )
    assert {job["id"] for job in page.request.get(base + "/api/jobs").json()} == before
