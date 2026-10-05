"""Native Kekulé drawings and chemistry identity; no new scientific jobs."""

import base64
import hashlib
import json
import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

from layout_browser_helpers import catalog
from playwright.sync_api import expect, sync_playwright


def assert_native_bonds(svg):
    root = ET.fromstring(svg)
    assert root.tag.endswith("svg")
    assert not root.findall(".//{http://www.w3.org/2000/svg}circle")
    # Indigo exports aromatic circles as sampled line paths, rather than <circle>.
    for node in root.findall(".//{http://www.w3.org/2000/svg}path"):
        if node.get("stroke") and node.get("fill") == "none":
            assert len(re.findall(r"\bL\b", node.get("d", ""))) < 40


def test_native_kekule_drawings_and_identity():
    evidence = Path("server_tests/evidence/ketcher-depiction")
    evidence.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ["WB_STATE_DIR"]) / "jobs.sqlite3"
    with sqlite3.connect(state) as db:
        before = db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall()
    errors, mutations, steps = [], [], []
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                mutations.append(request.url)
                if request.method in {"POST", "PUT", "PATCH", "DELETE"} and "/api/" in request.url
                else None
            ),
        )
        page.goto(os.environ["WB_BROWSER_URL"])

        def open_result(name):
            catalog(page)
            page.get_by_role("button", name=name, exact=True).click()
            page.locator(".module-template:visible").get_by_role(
                "button", name="示例结果", exact=True
            ).click()
            expect(page.get_by_text("正在读取结果…", exact=True)).not_to_be_visible(timeout=30000)

        def inspect_images(name):
            expect(page.locator(".molecule-image img").first).to_be_visible(timeout=90000)
            page.wait_for_function(
                """() => {
                const images = [...document.querySelectorAll('.molecule-image img')];
                return images.length && images.every(image =>
                    image.complete && image.naturalWidth > 0);
            }""",
                timeout=30000,
            )
            for image in page.locator(".molecule-image img").all():
                url = image.get_attribute("src")
                assert url.startswith("data:image/svg+xml;base64,")
                assert_native_bonds(base64.b64decode(url.split(",", 1)[1]))
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=str(evidence / (name + ".png")))
            steps.append(name)

        try:
            open_result("计算小分子性质")
            inspect_images("abl-inhibitor-native-kekule")
            page.get_by_label("二维图线条粗细", exact=True).select_option("2.2")
            expect(page.get_by_role("link", name="下载结构图片", exact=True)).to_be_visible(
                timeout=90000
            )
            image = page.locator(".molecule-image:not(.is-thumbnail) img")
            href = page.get_by_role("link", name="下载结构图片", exact=True).get_attribute("href")
            assert href == image.get_attribute("src")
            with page.expect_download() as event:
                page.get_by_role("link", name="下载结构图片", exact=True).click()
            target = evidence / "abl-inhibitor-native.svg"
            event.value.save_as(target)
            assert target.read_bytes() == base64.b64decode(href.split(",", 1)[1])
            assert_native_bonds(target.read_bytes())

            open_result("探索分子结合模式")
            page.get_by_role("tab", name="二维结构", exact=True).click()
            inspect_images("brd4-jq1-native-kekule")
            open_result("口袋条件分子生成")
            page.get_by_role("tab", name="二维结构", exact=True).click()
            inspect_images("generated-native-kekule")

            # Use only the hidden drawing service. InChI keys include connectivity,
            # stereochemistry, isotope and protonation layers; source strings stay intact.
            identities = page.evaluate("""async () => {
                const k = document.querySelector('.drawing-service-frame').contentWindow.ketcher;
                const cases = [
                    ['charged-isotope', '[13CH3][C@@H]([NH3+])c1ccccc1.[Cl-]'],
                    ['opposite-stereo', '[13CH3][C@H]([NH3+])c1ccccc1.[Cl-]'],
                    ['fused-heteroaromatic', 'c1ccc2[nH]ccc2c1']
                ];
                const rows = [];
                for (const [name, source] of cases) {
                    await k.setMolecule(source);
                    const before = await k.getInChIKey();
                    await k.layout();
                    await k.dearomatize();
                    const mol = await k.getMolfile();
                    const after = await k.getInChIKey();
                    const lines = mol.split(/\\r?\\n/);
                    const atoms = Number(lines[3].slice(0,3));
                    const count = Number(lines[3].slice(3,6));
                    const orders = lines.slice(4+atoms,4+atoms+count).map(x=>Number(x.slice(6,9)));
                    rows.push({name,source,before,after,atoms,orders});
                }
                return rows;
            }""")
            for row in identities:
                assert row["before"] and row["before"] == row["after"]
                assert row["atoms"] >= 9 and 4 not in row["orders"]
                assert row["orders"].count(2) >= 3
            assert identities[0]["after"] != identities[1]["after"]
            assert not errors and not mutations, (errors, mutations)
            with sqlite3.connect(state) as db:
                assert db.execute("SELECT id,status FROM jobs ORDER BY id").fetchall() == before
            (evidence / "native-identity.json").write_text(json.dumps(identities, indent=2))
        finally:
            (evidence / "acceptance.json").write_text(
                json.dumps(
                    {
                        "steps": steps,
                        "errors": errors,
                        "mutations": mutations,
                        "svg_sha256": hashlib.sha256(target.read_bytes()).hexdigest()
                        if "target" in locals() and target.is_file()
                        else None,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            browser.close()
