"""Real BRD4 residue focus retains a readable ligand and native source geometry."""

import json
import os

from ensemble_browser_helpers import EVIDENCE, capture, download, open_result, preserve_assets
from playwright.sync_api import expect, sync_playwright


def test_real_brd4_residue_focus_context_and_view_download():
    base = os.environ["WB_BROWSER_URL"]
    errors, submissions, views = [], [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                submissions.append(request.url)
                if request.method == "POST"
                and request.url.split("?")[0].endswith(("/api/jobs", "/api/batches"))
                else None
            ),
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        info = page.request.get(base + "/api/examples/diffsbdd.interactions").json()
        job_id = info["pin"]["job_id"]
        job = page.request.get(base + "/api/jobs/" + job_id).json()
        assert job["request"]["operation"] == "diffsbdd"
        payload = job["request"]["payload"]
        assert payload["mode"] == "interactions"
        references = [payload["protein"], payload["molecule"]]
        preserved = preserve_assets(page, references)
        try:
            for width in (1440, 1331, 390):
                page.set_viewport_size({"width": width, "height": 1000})
                open_result(page, "分子相互作用")
                control = page.get_by_role("button", name="A:ASN140", exact=True)
                control.focus()
                control.press("Enter")
                expect(control).to_have_attribute("aria-pressed", "true")
                expect(control).to_have_css("background-color", "rgba(0, 0, 0, 0)")
                panel = page.locator(".viewer-panel")
                panel.scroll_into_view_if_needed()
                capture(page, "native-brd4-residue-context-" + str(width))
                panel.get_by_role("button", name="生成三维视图图片", exact=True).click()
                image = panel.get_by_role("img", name="当前三维视图图片", exact=True)
                expect(image).to_be_visible(timeout=15000)
                stats = image.evaluate("""async (image) => {
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                    const context = canvas.getContext('2d'); context.drawImage(image,0,0);
                    const {data} = context.getImageData(0,0,canvas.width,canvas.height);
                    let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1,count=0;
                    for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
                        const i=(y*canvas.width+x)*4;
                        if(data[i+3]>100 && data[i+1]>140 &&
                            data[i+1]>data[i]*1.4 && data[i+1]>data[i+2]*1.2) {
                            x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;
                        }
                    }
                    return {x0,y0,x1,y1,count,width:canvas.width,height:canvas.height};
                }""")
                assert stats["count"] > 50, stats
                assert 0.015 < (stats["x1"] - stats["x0"]) / stats["width"] < 0.85, stats
                png = download(
                    page,
                    panel.get_by_role("link", name="下载视图 PNG", exact=True),
                    "brd4-residue-context-" + str(width) + ".png",
                )
                assert png.startswith(b"\x89PNG\r\n\x1a\n") and len(png) > 15000
                views.append({"viewport": width, "ligand_pixels": stats})
                panel.get_by_role("button", name="关闭图片", exact=True).click()
                panel.get_by_role("button", name="回到全局", exact=True).click()
                expect(
                    panel.get_by_role("button", name="生成三维视图图片", exact=True)
                ).to_be_enabled()
            assert preserve_assets(page, references) == preserved
            assert (
                page.request.get(base + "/api/jobs").json() == before
                and not errors
                and not submissions
            )
            (EVIDENCE / "context-camera.json").write_text(
                json.dumps(
                    {
                        "views": views,
                        "native_job": job_id,
                        "sources_preserved": preserved,
                        "errors": errors,
                        "submissions": submissions,
                    },
                    indent=2,
                )
            )
        finally:
            browser.close()
