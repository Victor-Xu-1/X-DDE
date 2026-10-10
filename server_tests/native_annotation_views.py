"""Researcher-visible controls on real retained structures; no scientific execution."""

from playwright.sync_api import expect


def study_structure(page, language):
    zh = language == "zh"
    page.get_by_role("navigation", name="主导航" if zh else "Main navigation").get_by_role(
        "button", name="全部能力" if zh else "All capabilities", exact=True
    ).click()
    card = page.locator('button[data-capability="properties"]').first
    if not card.is_visible():
        card.locator("xpath=ancestor::details").locator("summary").click()
    card.click()
    page.get_by_role(
        "button", name="查看研究材料" if zh else "Preview study inputs", exact=True
    ).click()
    preview = page.locator(".study-input-preview")
    preview.get_by_role(
        "button", name="STAT6 实验参考" if zh else "STAT6 experimental reference", exact=True
    ).click()
    return preview.locator(".viewer-panel").first


def residue_labels(panel, language):
    zh = language == "zh"
    panel.get_by_role(
        "button", name="配体与口袋" if zh else "Ligand and pocket", exact=True
    ).click()
    panel.get_by_role(
        "combobox", name="关注残基" if zh else "Focus residues", exact=True
    ).select_option("all")
    panel.get_by_role(
        "checkbox", name="显示相互作用" if zh else "Show interactions", exact=True
    ).uncheck()
    panel.get_by_role(
        "checkbox", name="残基与距离" if zh else "Residues and distances", exact=True
    ).check()
    return "A:"


def measure_residues(panel, language):
    zh = language == "zh"
    panel.get_by_role(
        "checkbox", name="显示相互作用" if zh else "Show interactions", exact=True
    ).uncheck()
    panel.get_by_role(
        "checkbox", name="残基与距离" if zh else "Residues and distances", exact=True
    ).uncheck()
    panel.locator(".selection-editor > summary").click()
    panel.get_by_role(
        "combobox", name="鼠标点选" if zh else "Mouse selection", exact=True
    ).select_option("distance")
    panel.locator(".residue-browser > summary").click()
    # Public native atom observations verify the same two real source residues
    # selected through the visible list; no app state or pseudo-atoms are added.
    expected = panel.locator("iframe").first.evaluate("""frame => {
      const viewer=frame.contentWindow.document.querySelector('canvas')._3dmol_viewer;
      const a=viewer.selectedAtoms({model:0,chain:'A',resi:590,resn:'GLN'})[0];
      const b=viewer.selectedAtoms({model:0,chain:'A',resi:562,resn:'ARG'})[0];
      if(!a || !b) throw Error('The deposited STAT6 residues must be present');
      return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z).toFixed(2)+' Å';
    }""")
    query = panel.get_by_role("textbox", name="搜索残基" if zh else "Search residues", exact=True)
    for residue in ("A:GLN590", "A:ARG562"):
        query.fill(residue)
        panel.locator(".residue-options").get_by_role("button", name=residue, exact=True).click()
    expect(panel.locator(".measurement-status")).to_contain_text(expected)
    return expected


def source_bytes(page, base, panel):
    sources = panel.locator(".viewer-original-downloads a").evaluate_all(
        "links => links.map(link => link.getAttribute('href'))"
    )
    assert sources, "The displayed native source must remain downloadable"
    return {
        url: page.request.get(base + url if url.startswith("/") else url).body() for url in sources
    }
