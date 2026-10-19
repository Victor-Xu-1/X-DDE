"""Bounded DOM observation of completed responsive layout without unsafe-eval or CSP changes."""

import time


def wait_for_responsive_width(page, timeout=5):
    deadline = time.monotonic() + timeout
    while True:
        sizes = page.evaluate(
            "() => ({width: innerWidth, scroll: document.documentElement.scrollWidth})"
        )
        if sizes["scroll"] <= sizes["width"] + 1:
            return sizes
        if time.monotonic() >= deadline:
            raise AssertionError(f"Responsive page still overflows after chart reflow: {sizes}")
        # Plotly's resize is asynchronous. Poll only this exact DOM condition.
        time.sleep(0.05)
