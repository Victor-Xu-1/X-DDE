"""Record real input views at explicit scroll positions, without changing their layout."""

import json
import subprocess

from playwright.sync_api import expect


def verify_review_fonts():
    """Reject a browser environment that cannot draw the actual Chinese UI."""
    query = ["fc-match", "-f"]
    family = subprocess.check_output([*query, "%{family}", "sans:lang=zh"], text=True)
    charset = subprocess.check_output([*query, "%{charset}", "sans:lang=zh"], text=True)
    ranges = []
    for entry in charset.split():
        values = entry.split("-")
        low, high = int(values[0], 16), int(values[-1], 16)
        ranges.append((low, high))
    characters = "药物结构"
    supported = all(any(low <= ord(char) <= high for low, high in ranges) for char in characters)
    if not supported:
        raise RuntimeError("The review browser lacks the required Chinese glyphs.")
    return {"family": family, "verified_characters": characters}


def launch_review_browser(driver):
    """Use the hosted runner's installed Google Chrome, with no browser fallback."""
    return driver.chromium.launch(
        channel="chrome", args=["--enable-unsafe-swiftshader"]
    )


def capture_input_review(page, review, evidence):
    recheck = page.get_by_role(
        "button", name="Check environment again", exact=True
    ).or_(page.get_by_role("button", name="重新检查计算环境", exact=True))
    if recheck.count():
        recheck.scroll_into_view_if_needed()
        expect(recheck).to_be_visible()
        unobscured = recheck.evaluate("""node => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return !!hit && (node === hit || node.contains(hit));
        }""")
        assert unobscured, "The review actions or header obscure the environment recheck"
        page.screenshot(path=evidence / "input-review-controls-viewport.png")
    review.evaluate("""review => {
      const form = review.closest('.questionnaire');
      for (let node = form?.parentElement; node; node = node.parentElement)
        node.scrollTo({top: 0, left: 0, behavior: 'instant'});
      window.scrollTo({top: 0, left: 0, behavior: 'instant'});
    }""")
    geometry = review.evaluate("""node => {
      const rect = element => {
        const box = element.getBoundingClientRect();
        return {x: box.x, y: box.y, width: box.width, height: box.height};
      };
      const form = node.closest('.questionnaire');
      const actions = form.querySelector('.questionnaire-actions');
      const select = node.querySelector('.molecule-drawing-style select');
      const style = getComputedStyle(select);
      const context = document.createElement('canvas').getContext('2d');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const label = select.selectedOptions[0].textContent.trim();
      const labelWidth = context.measureText(label).width;
      return {scrollY, viewport: {width: innerWidth, height: innerHeight},
        drawing: rect(node.querySelector('.molecule-image')),
        summary: rect(node.querySelector('.molecular-input-summary')),
        actions: rect(actions), actionsPosition: getComputedStyle(actions).position,
        lineControl: {label, labelWidth, width: select.clientWidth,
          fits: labelWidth + 32 <= select.clientWidth}};
    }""")
    assert geometry["actionsPosition"] == "static"
    assert geometry["lineControl"]["fits"], geometry["lineControl"]
    geometry["browser"] = {
        "version": page.context.browser.version,
        "user_agent": page.evaluate("navigator.userAgent"),
    }
    geometry["font"] = verify_review_fonts()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    (evidence / "input-review-geometry.json").write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=evidence / "molecular-input-workspace.png", full_page=True)
    page.screenshot(path=evidence / "input-review-top-viewport.png")
