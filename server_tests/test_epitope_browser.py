"""Inspect the real trastuzumab/HER2 contact case; never enqueue science."""

import csv
import hashlib
import io
import json
import os
import struct
from pathlib import Path

from layout_browser_helpers import catalog
from playwright.sync_api import expect, sync_playwright


def test_native_epitope_contacts_structure_selection_and_downloads():
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    errors, submissions, captures = [], [], []
    preserved = False
    base = os.environ["WB_BROWSER_URL"]
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: submissions.append(request.url) if request.method == "POST" else None,
        )
        page.goto(base)
        before = page.request.get(base + "/api/jobs").json()
        examples = page.request.get(base + "/api/examples").json()["examples"]
        example = next(item for item in examples if item["module"]["capability_id"] == "epitope")
        job_id = example["pin"]["job_id"]
        job = page.request.get(base + f"/api/jobs/{job_id}").json()
        native = page.request.get(base + f"/api/jobs/{job_id}/result").json()
        for _ in range(8):
            if "epitope_residues" in native:
                break
            assert isinstance(native.get("result"), dict) and native.get("available") is not False
            native = native["result"]
        rows = native["epitope_residues"]
        protein = sorted(
            (row for row in rows if row["residue_name"] not in {"HOH", "WAT", "H2O", "DOD"}),
            key=lambda row: -row["contacts"],
        )
        assert len(protein) > 5 and len(rows) > len(protein)
        source = job["request"]["payload"]["structure_path"]
        assert source.startswith("asset:")
        source_url = base + "/api/assets/" + source.removeprefix("asset:")
        source_digest = hashlib.sha256(page.request.get(source_url).body()).hexdigest()

        def open_result(english=False):
            if english:
                page.get_by_role("navigation", name="Main navigation").get_by_role(
                    "button", name="All capabilities", exact=True
                ).click()
                for summary in page.locator(".capability-additional > summary").all():
                    summary.click()
            else:
                catalog(page)
            page.get_by_role(
                "button",
                name="Epitope and hotspot contacts" if english else "表位与热点接触",
                exact=True,
            ).and_(page.locator(".tool-card")).click()
            page.get_by_role(
                "button", name="Example results" if english else "示例结果", exact=True
            ).click()
            expect(
                page.get_by_role(
                    "button", name="Capture 3D view" if english else "生成三维视图图片", exact=True
                )
            ).to_be_enabled(timeout=30000)

        def capture(name):
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert page.locator(".epitope-results [role=alert]").count() == 0
            page.screenshot(path=str(evidence / f"{name}.png"))
            captures.append(name)

        def download(control, name):
            with page.expect_download(timeout=30000) as event:
                control.click()
            target = evidence / name
            event.value.save_as(target)
            return target.read_bytes()

        try:
            open_result()
            table = page.get_by_role("table", name="蛋白接触残基", exact=True)
            expect(table.locator("tbody tr")).to_have_count(5)
            expect(page.get_by_role("button", name="整体骨架", exact=True)).to_have_attribute(
                "aria-pressed", "true"
            )
            left = page.locator(".epitope-contact-list").first.bounding_box()
            right = page.locator(".epitope-contact-map").bounding_box()
            assert left and right and left["x"] + left["width"] <= right["x"]
            assert abs(left["y"] - right["y"]) <= 2 and right["y"] < 500
            contact_heading = page.locator(".epitope-contact-heading h3").bounding_box()
            structure_heading = page.locator(
                ".epitope-contact-map .studio-heading h3"
            ).bounding_box()
            assert contact_heading and structure_heading
            assert abs(contact_heading["y"] - structure_heading["y"]) <= 4
            capture("epitope-native-desktop")
            first = protein[0]
            label = f"{first['chain']}:{first['residue_name']}{first['residue_id']}"
            control = table.get_by_role("button", name=label, exact=True)
            control.focus()
            control.press("Enter")
            expect(control).to_have_attribute("aria-pressed", "true")
            expect(page.locator(".selection-explanation")).to_contain_text(label, timeout=15000)
            capture("epitope-native-residue-selection")
            page.get_by_role("combobox", name="显示残基", exact=True).select_option("3")
            expect(table.locator("tbody tr")).to_have_count(3)
            raw = download(
                page.get_by_role("button", name="下载表格", exact=True),
                "native-protein-contacts.csv",
            )
            exported = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
            assert [
                (row["chain"], row["residue_name"], int(row["residue_id"]), int(row["contacts"]))
                for row in exported
            ] == [
                (row["chain"], row["residue_name"], row["residue_id"], row["contacts"])
                for row in protein
            ]
            page.get_by_role("combobox", name="显示残基", exact=True).select_option("all")
            expect(table.locator("tbody tr")).to_have_count(len(protein))
            capture("epitope-native-all-contacts")
            page.get_by_role("button", name="回到全局", exact=True).click()
            page.get_by_role("button", name="生成三维视图图片", exact=True).click()
            image = page.get_by_role("link", name="下载视图 PNG", exact=True)
            expect(image).to_be_visible(timeout=10000)
            png = download(image, "native-epitope-complex.png")
            assert png.startswith(b"\x89PNG\r\n\x1a\n") and len(png) > 20000
            width, height = struct.unpack(">II", png[16:24])
            assert 500 < width <= 4096 and 400 < height <= 4096
            page.get_by_role("button", name="关闭图片", exact=True).click()
            page.set_viewport_size({"width": 390, "height": 1000})
            # Open a fresh portrait scene, not only a scene resized after fitting on desktop.
            open_result()
            right = page.locator(".epitope-contact-map").bounding_box()
            left = page.locator(".epitope-contact-list").first.bounding_box()
            assert right and left and right["y"] + right["height"] <= left["y"]
            page.locator(".epitope-results").scroll_into_view_if_needed()
            capture("epitope-native-compact")
            page.get_by_role("button", name="生成三维视图图片", exact=True).click()
            expect(page.get_by_role("img", name="当前三维视图图片", exact=True)).to_be_visible(
                timeout=10000
            )
            bounds = page.evaluate("""async () => {
                const image = document.querySelector('.viewer-snapshot img');
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d'); context.drawImage(image,0,0);
                const {data} = context.getImageData(0,0,canvas.width,canvas.height);
                const bg = [...data.slice(0,4)];
                let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1,count=0;
                for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
                    const i=(y*canvas.width+x)*4;
                    if(data[i+3]>20 && [0,1,2].some(c=>Math.abs(data[i+c]-bg[c])>20)) {
                        x0=Math.min(x0,x);y0=Math.min(y0,y);
                        x1=Math.max(x1,x);y1=Math.max(y1,y);count++;
                    }
                }
                return {x0,y0,x1,y1,count,width:canvas.width,height:canvas.height};
            }""")
            assert bounds["count"] > 1000, bounds
            assert bounds["x0"] > 3 and bounds["x1"] < bounds["width"] - 4, bounds
            assert bounds["y0"] > 3 and bounds["y1"] < bounds["height"] - 4, bounds
            download(
                page.get_by_role("link", name="下载视图 PNG", exact=True),
                "native-epitope-compact.png",
            )
            page.get_by_role("button", name="关闭图片", exact=True).click()
            page.get_by_role("button", name="设置与帮助", exact=True).click()
            page.get_by_role("menuitem", name="界面设置", exact=True).click()
            page.locator("#settings-language").select_option("en")
            page.set_viewport_size({"width": 1440, "height": 1000})
            open_result(english=True)
            expect(page.get_by_role("combobox", name="Show residues", exact=True)).to_have_value(
                "5"
            )
            capture("epitope-native-english")
            assert hashlib.sha256(page.request.get(source_url).body()).hexdigest() == source_digest
            assert before == page.request.get(base + "/api/jobs").json()
            preserved = True
            assert not errors, errors
            assert not submissions, "Result inspection must never submit tasks or mutate assets"
        finally:
            (evidence / "epitope-review.json").write_text(
                json.dumps(
                    {
                        "revision": os.environ.get("GITHUB_SHA"),
                        "captures": captures,
                        "protein_contact_rows": len(protein),
                        "water_rows": len(rows) - len(protein),
                        "source_sha256": source_digest,
                        "source_coordinates_preserved": preserved,
                        "errors": errors,
                        "posts": submissions,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            browser.close()
