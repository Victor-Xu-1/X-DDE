"""Physical typography and real transparency on the supplied STAT6 structures."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.publication_browser_helpers import export_figure
from server_tests.test_hydrogen_policy_browser import non_donor_hydrogens
from server_tests.test_navigation_shell_browser import open_navigation

EVIDENCE = Path("outputs/publication-browser/molecular-print")


def vector_metrics(page, source):
    return page.evaluate(
        """async source => {
          const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
          svg.style.position='absolute'; svg.style.left='-10000px';
          document.body.append(svg);
          try {
            const rootScale=Math.hypot(svg.getCTM().a,svg.getCTM().b);
            const weight=[...svg.querySelectorAll('path[stroke-width]')].map(path => {
              const m=path.getCTM();
              return Number(path.getAttribute('stroke-width'))*Math.hypot(m.a,m.b)/rootScale;
            }).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
            const glyphs=[...svg.querySelectorAll('use')].map(node=>{
              const m=node.getCTM();
              return node.getBBox().height*Math.hypot(m.a,m.b)/rootScale;
            }).filter(n=>n>0);
            const image=new Image();
            image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(source)));
            await image.decode();
            const canvas=document.createElement('canvas'); canvas.width=600; canvas.height=400;
            const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0,600,400);
            return {viewBox:svg.getAttribute('viewBox'),width:svg.getAttribute('width'),
              medianBond:weight[Math.floor(weight.length/2)],glyphPt:Math.max(...glyphs),
              // Sample inside the paper margin; the outer SVG edge is antialiased.
              marginAlpha:ctx.getImageData(8,8,1,1).data[3],glyphCount:glyphs.length};
          } finally {svg.remove();}
        }""",
        source,
    )


@pytest.mark.parametrize("language", ["en", "zh"])
def test_stat6_native_print_controls_change_real_paths_and_pixels(language):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, EVIDENCE / (language + ".log")) as base,
        sync_playwright() as p,
    ):
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        jobs = page.request.get(base + "/api/jobs").json()
        open_navigation(page, language).get_by_role(
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
        preview.get_by_role("button", name="2D", exact=True).click()
        rows = []
        for name, choice in [
            ("warhead", "指定小分子" if zh else "Study small molecule"),
            ("protac", "指定 PROTAC" if zh else "Study PROTAC"),
        ]:
            preview.get_by_role("button", name=choice, exact=True).click()
            drawing = preview.locator(".molecule-image")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            source_url = preview.get_by_role(
                "link", name="下载原始材料" if zh else "Download source input"
            ).get_attribute("href")
            original = page.request.get(base + source_url).body()
            drawing.get_by_role(
                "combobox", name="二维图线条粗细" if zh else "2D drawing line weight"
            ).select_option("1.2")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            trigger = drawing.get_by_role(
                "button", name="文献图导出 ↓" if zh else "Export figure ↓", exact=True
            )

            def configure(dialog, font, transparent):
                dialog.get_by_role(
                    "combobox", name="版面宽度" if zh else "Figure width", exact=True
                ).select_option("183")
                dialog.get_by_role(
                    "combobox", name="印刷字号" if zh else "Printed type size", exact=True
                ).select_option(str(font))
                dialog.get_by_role(
                    "checkbox", name="透明背景" if zh else "Transparent background"
                ).set_checked(transparent)

            fine = export_figure(
                page,
                trigger,
                EVIDENCE,
                f"{language}-{name}-7pt-fine",
                language,
                "SVG",
                lambda dialog: configure(dialog, 7, False),
            )
            drawing.get_by_role(
                "combobox", name="二维图线条粗细" if zh else "2D drawing line weight"
            ).select_option("2.2")
            expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=45000)
            bold = export_figure(
                page,
                trigger,
                EVIDENCE,
                f"{language}-{name}-9pt-bold-transparent",
                language,
                "SVG",
                lambda dialog: configure(dialog, 9, True),
            )
            a, b = vector_metrics(page, fine.read_text()), vector_metrics(page, bold.read_text())
            assert a["width"] == b["width"] == "183mm"
            assert abs(float(b["viewBox"].split()[2]) - 183 / 25.4 * 72) < 1e-6
            assert a["glyphCount"] > 5 and b["glyphCount"] == a["glyphCount"]
            assert 1.22 < b["glyphPt"] / a["glyphPt"] < 1.36, (a, b)
            assert 1.7 < b["medianBond"] / a["medianBond"] < 2.0, (a, b)
            assert (a["marginAlpha"], b["marginAlpha"]) == (255, 0), (a, b)
            native = page.evaluate(
                """async () => {
                  const frame=document.querySelector('.drawing-service-frame');
                  return JSON.parse(await frame.contentWindow.ketcher.getKet());
                }"""
            )
            assert not non_donor_hydrogens(native)
            assert page.request.get(base + source_url).body() == original
            rows.append(
                {
                    "input": name,
                    "source_sha256": hashlib.sha256(original).hexdigest(),
                    "7pt_fine": a,
                    "9pt_bold_transparent": b,
                }
            )
        page.set_viewport_size({"width": 390, "height": 1000})
        export_figure(
            page,
            trigger,
            EVIDENCE,
            language + "-mobile-protac",
            language,
            "SVG",
            lambda dialog: configure(dialog, 9, True),
        )
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert page.request.get(base + "/api/jobs").json() == jobs
        assert not errors
        (EVIDENCE / (language + "-physical-acceptance.json")).write_text(
            json.dumps(rows, indent=2), encoding="utf-8"
        )
        browser.close()
