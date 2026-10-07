"""Explicit user choices from actual reviewed structures; no queued science tasks."""

from playwright.sync_api import expect


def choose_template_objective(page, name, stage):
    if stage != 2:
        return
    if name == "结合相互作用与三维标注":
        choice = page.get_by_role("combobox", name="分析配体", exact=True)
        expect(choice.get_by_role("option", name="JQ1 · A:1", exact=True)).to_have_count(
            1, timeout=30000
        )
        choice.select_option(label="JQ1 · A:1")
    elif name == "配体环境中的蛋白序列设计":
        choice = page.get_by_role("combobox", name="从列表补选残基", exact=True)
        expect(choice.get_by_role("option", name="ASN · A:140", exact=True)).to_have_count(
            1, timeout=30000
        )
        choice.select_option(label="ASN · A:140")
    elif name == "结合蛋白、肽与抗体设计":
        target = page.get_by_role("region", name="研究目标选择", exact=True)
        chain = target.get_by_role("checkbox", name="链 B", exact=True)
        expect(chain).to_be_visible(timeout=30000)
        chain.check()
    elif name == "区域暴露与埋藏":
        choice = page.get_by_role("combobox", name="选择配体或残基", exact=True)
        expect(choice.get_by_role("option", name="A:JQ1 1", exact=True)).to_have_count(
            1, timeout=30000
        )
        choice.select_option(label="A:JQ1 1")
