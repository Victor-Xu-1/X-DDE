"""Record real input views at explicit scroll positions, without changing their layout."""

import json

from playwright.sync_api import expect


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
    page.evaluate("""() => {
      const form = document.querySelector('.questionnaire');
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
      return {scrollY, viewport: {width: innerWidth, height: innerHeight},
        drawing: rect(node.querySelector('.molecule-image')),
        summary: rect(node.querySelector('.molecular-input-summary')),
        actions: rect(actions), actionsPosition: getComputedStyle(actions).position};
    }""")
    assert geometry["actionsPosition"] == "static"
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    (evidence / "input-review-geometry.json").write_text(json.dumps(geometry, indent=2))
    page.screenshot(path=evidence / "molecular-input-workspace.png", full_page=True)
    page.screenshot(path=evidence / "input-review-top-viewport.png")
