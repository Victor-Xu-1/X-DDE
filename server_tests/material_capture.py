"""Consistent material-form screenshots after native focus and step navigation."""


def capture_material(page, path):
    page.evaluate("""() => {
        window.scrollTo({top:0, left:0, behavior:'instant'});
        return new Promise(resolve => requestAnimationFrame(
            () => requestAnimationFrame(resolve)));
    }""")
    assert page.evaluate("window.scrollY") == 0
    assert page.locator(".studio-topbar").bounding_box()["y"] < 40
    page.screenshot(path=path, full_page=True)
