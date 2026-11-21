"""Export semantic color keys with the exact archived native molecular scene."""

import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure, inspect_png

EVIDENCE = Path("outputs/native-color-key")
CAMERA = "frame => frame.contentDocument.querySelector('canvas')._3dmol_viewer.getView()"

OBSERVE_FIGURES = """(() => {
    const drawn = new WeakMap();
    const text = CanvasRenderingContext2D.prototype.fillText;
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    window.__figureKeys = [];
    CanvasRenderingContext2D.prototype.fillText = function(value,x,y,...args) {
      const rows = drawn.get(this.canvas) || [];
      rows.push({value:String(value),x,y,font:this.font});
      drawn.set(this.canvas,rows);
      return text.call(this,value,x,y,...args);
    };
    HTMLCanvasElement.prototype.toBlob = function(...args) {
      const rows = drawn.get(this);
      if (rows?.some(row => /^(APBS|pLDDT|Approximate partial charge)/.test(row.value))) {
        window.__figureKeys.push({width:this.width,height:this.height,rows});
      }
      return toBlob.apply(this,args);
    };
  })()"""


def colored_footer(dialog, palette):
    return dialog.locator(".figure-export-canvas img").evaluate(
        """(image, palette) => {
          const canvas=document.createElement('canvas');
          canvas.width=image.naturalWidth;
          canvas.height=image.naturalHeight;
          const context=canvas.getContext('2d');
          context.drawImage(image,0,0);
          const height=Math.floor(canvas.height*0.14);
          const pixels=context.getImageData(0,canvas.height-height,canvas.width,height).data;
          const local = rgb => {
            let count=0;
            for(let i=0;i<pixels.length;i+=4){
              if(pixels[i+3]===255 && rgb.every((value,k)=>Math.abs(pixels[i+k]-value)<3))
                count++;
            }
            return count;
          };
          return palette.map(local);
        }""",
        palette,
    )


@pytest.mark.parametrize(("color_key", "tool", "language", "dpi"), [
    ("potential", "apbs.potential", "en", 300),
    ("confidence", "predict", "zh", 600),
    ("partial-charge", "predict", "en", 300),
])
def test_retained_native_figure_includes_applied_color_key(color_key, tool, language, dpi):
    evidence = EVIDENCE / color_key
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    state = Settings.from_env().state_dir
    with platform(state, evidence / "server.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        page.add_init_script(OBSERVE_FIGURES)
        jobs = page.request.get(base + "/api/jobs").json()
        writes = []
        page.on("request", lambda req: writes.append(req.url) if req.method == "POST" else None)
        pin = page.request.get(f"{base}/api/examples/{tool}?profile=stat6").json()["pin"]
        page.goto(f"{base}/#task={pin['job_id']}")
        viewer = page.locator(".structure-workbench .viewer-panel")
        trigger = viewer.locator(".figure-export-trigger")
        frame = viewer.locator(".molecular-stage iframe")
        expect(trigger).to_be_enabled(timeout=45000)
        surface_palette = [[255, 180, 180], [180, 180, 255]]
        if color_key == "potential":
            scale = page.get_by_role("combobox", name="Color range", exact=True)
            scale.select_option("10")
            expect(viewer.locator(".potential-legend")).to_contain_text("+10 kBT/e")
            labels = {"APBS potential (kBT/e)", "−10", "0", "+10"}
            palette = surface_palette
        else:
            color = viewer.get_by_role(
                "combobox", name="结构着色" if zh else "Structure coloring", include_hidden=True
            )
            if not color.is_visible():
                viewer.locator(".viewer-tool-group.is-display > button").click()
            if color_key == "confidence":
                color.select_option("confidence")
                expect(viewer.locator(".confidence-legend")).to_be_visible()
                labels = {"pLDDT · 聚合物置信度（0–100）", "> 90", "70–90", "50–<70", "< 50"}
                palette = [[0, 83, 214], [101, 203, 243], [255, 219, 19], [255, 125, 69]]
            else:
                color.select_option("chain")
                viewer.get_by_role("button", name="Surface", exact=True).click()
                legend = viewer.locator(".surface-legend")
                expect(legend).to_contain_text("Approximate charge")
                legend.get_by_role("button", name="Surface charge help").focus()
                expect(page.get_by_role("tooltip")).to_contain_text("fixed range −0.6 to +0.6 e")
                labels = {"Approximate partial charge (e)", "−0.6", "0", "+0.6"}
                palette = surface_palette
                if legend.locator(".surface-charge-missing").is_visible():
                    labels.add("Gray · no charge data")
                    palette = [*palette, [177, 183, 193]]
        expect(trigger).to_be_enabled()
        before = frame.evaluate(CAMERA)

        def configure(dialog):
            dialog.get_by_role(
                "combobox", name="清晰度" if zh else "Resolution", exact=True,
            ).select_option(str(dpi))
            if zh:
                dialog.get_by_role("checkbox", name="透明背景", exact=True).check()

        def inspect(dialog):
            assert all(color > 20 for color in colored_footer(dialog, palette))

        figure = export_figure(
            page, trigger, evidence, "with-color-key", language,
            configure=configure, inspect=inspect,
        )
        width = 1051 if dpi == 300 else 2102
        inspect_png(figure, dpi=dpi, width=width)
        captures = page.evaluate("window.__figureKeys")
        assert captures and captures[-1]["width"] == captures[-1]["height"] == width
        rows = captures[-1]["rows"]
        assert {row["value"] for row in rows} == labels
        assert all(row["y"] > width * 0.8 for row in rows)
        (evidence / "color-key.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        assert frame.evaluate(CAMERA) == before
        if color_key == "potential":
            chains = viewer.locator(".viewer-chain-menu")
            chains.locator("summary").click()
            for chain in chains.get_by_role("checkbox").all():
                chain.click()
                expect(chain).not_to_be_checked()
            expect(viewer.locator(".potential-legend")).to_have_count(0)
            chains.get_by_role("button", name="Show all chains", exact=True).click()
            expect(viewer.locator(".potential-legend")).to_contain_text("+10 kBT/e")
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not writes
        browser.close()
