"""Accept settled drawings or explicit unavailable states, never loading screenshots."""

import json
from pathlib import Path
from uuid import uuid4


def settle_visible_drawings(page):
    try:
        page.wait_for_function(
            """() => {
            const visible = node => {
                const bounds = node.getBoundingClientRect();
                let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
                let right = Math.min(innerWidth, bounds.right);
                let bottom = Math.min(innerHeight, bounds.bottom);
                for (let parent = node.parentElement; parent; parent = parent.parentElement) {
                    const style = getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden' ||
                        style.visibility === 'collapse') return false;
                    if (parent.tagName === 'DETAILS' && !parent.open &&
                        !parent.querySelector(':scope > summary')?.contains(node)) return false;
                    const clip = parent.getBoundingClientRect();
                    if (['auto','scroll','hidden','clip'].includes(style.overflowX)) {
                        left = Math.max(left, clip.left); right = Math.min(right, clip.right);
                    }
                    if (['auto','scroll','hidden','clip'].includes(style.overflowY)) {
                        top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
                    }
                }
                return bounds.width > 0 && bounds.height > 0 && right > left && bottom > top;
            };
            return [...document.querySelectorAll('main .molecule-image')]
                .filter(visible).every(node => {
                    const state = node.dataset.drawingState;
                    if (state === 'loading') return false;
                    if (state === 'ready') {
                        const image = node.querySelector('img');
                        return image && image.complete && image.naturalWidth > 0;
                    }
                    return state === 'unavailable' || state === 'no-source';
                });
        }""",
            timeout=45000,
        )
    except Exception:
        root = Path("server_tests/evidence/task-layout")
        root.mkdir(parents=True, exist_ok=True)
        name = "drawing-timeout-" + uuid4().hex[:12]
        page.screenshot(path=str(root / (name + ".png")))
        states = page.evaluate("""() => [...document.querySelectorAll('main .molecule-image')]
            .slice(0,30).map(node => {
                const r = node.getBoundingClientRect(), img = node.querySelector('img');
                return {state:node.dataset.drawingState, label:img?.alt,
                    x:r.x,y:r.y,width:r.width,height:r.height,
                    complete:img?.complete,naturalWidth:img?.naturalWidth};
            })""")
        (root / (name + ".json")).write_text(json.dumps(states), encoding="utf-8")
        raise
