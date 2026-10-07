"""Accept settled drawings or explicit unavailable states, never loading screenshots."""


def settle_visible_drawings(page):
    page.wait_for_function(
        """() => {
            const visible = node => {
                const bounds = node.getBoundingClientRect();
                let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
                let right = Math.min(innerWidth, bounds.right);
                let bottom = Math.min(innerHeight, bounds.bottom);
                for (let parent = node.parentElement; parent; parent = parent.parentElement) {
                    const style = getComputedStyle(parent);
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
