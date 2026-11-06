"""Theme inspection of a public STAT6 reference through the native viewer protocol."""

import base64
import hashlib

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.store import Store


def reference_asset(state):
    content = verified_input("stat6_receptor")
    assets = AssetStore(Store(state / "jobs.sqlite3"), state / "assets")
    asset = assets.save("STAT6-appearance-reference.pdb", "structure", content)
    return asset, hashlib.sha256(content).hexdigest()


def load_reference(page, base, asset, checksum):
    page.evaluate("""() => {
        window.appearanceEvents = [];
        window.addEventListener('message', e => {
            if (e.origin === location.origin && e.data?.channel === 'opendde-viewer')
                window.appearanceEvents.push(e.data);
        });
        window.postMessage({channel:'opendde-viewer', type:'ready-request'}, location.origin);
    }""")
    wait_for_event(page, ["ready"])
    page.evaluate(
        """value => window.postMessage(
        {channel:'opendde-viewer', type:'load', value}, location.origin
    )""",
        {
            "urls": [base + "/api/assets/" + asset.id],
            "comparison": False,
            "expectedStructureSha256": checksum,
            "initialMode": "cartoon",
        },
    )
    wait_for_event(page, ["loaded", "error"])
    events = page.evaluate("window.appearanceEvents")
    assert not [e for e in events if e["type"] == "error"], events
    info = next(e["detail"] for e in events if e["type"] == "loaded")
    assert info["hasPolymer"] and info["atoms"] > 0
    return info


def wait_for_event(page, types):
    # An asynchronous function works under the viewer's strict CSP; Playwright's
    # string-predicate polling can invoke eval and is intentionally not enabled.
    page.evaluate(
        """types => new Promise((resolve, reject) => {
        const matches = data => data?.channel === 'opendde-viewer' && types.includes(data.type);
        if (window.appearanceEvents.some(matches)) { resolve(); return; }
        const timeout = setTimeout(() => {
            window.removeEventListener('message', receive);
            reject(new Error('Native viewer event timed out: ' + types.join(',')));
        }, 30000);
        function receive(event) {
            if (event.origin !== location.origin || !matches(event.data)) return;
            clearTimeout(timeout);
            window.removeEventListener('message', receive);
            resolve();
        }
        window.addEventListener('message', receive);
    })""",
        types,
    )


def rendered_background(page, path):
    # Wait for the native renderer's paint; use the composited screenshot rather
    # than GL clear state, which may belong to a transparent/offscreen pass.
    page.evaluate(
        "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    )
    screenshot = page.screenshot(path=path)
    rgba = page.evaluate(
        """async encoded => {
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return Array.from(context.getImageData(4, 4, 1, 1).data);
    }""",
        base64.b64encode(screenshot).decode(),
    )
    return rgba
