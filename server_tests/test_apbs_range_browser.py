"""Apply a display scale to an archived APBS surface in real Chrome."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/apbs-range")


def inspect_surface(frame, remember=False):
    result = frame.evaluate(
        """(frame, remember) => {
          const win = frame.contentWindow;
          const viewer = win.document.querySelector("canvas")._3dmol_viewer;
          const surface = Array.from({length:64}, (_, id) => viewer.getSurface(id))
            .find(parts => parts?.[0]?.geo?.geometryGroups?.some(group => group.vertices > 0));
          if (!surface) throw new Error("No native surface");
          const geometry = surface[0].geo;
          if (remember) win.__apbsTestGeometry = geometry;
          return {
            camera: viewer.getView(),
            sameGeometry: win.__apbsTestGeometry === geometry,
            png: viewer.pngURI(),
          };
        }""",
        remember,
    )
    result["png"] = hashlib.sha256(result["png"].encode()).hexdigest()
    return result


@pytest.mark.parametrize(("language", "width"), [("en", 1440), ("zh", 390)])
def test_edited_apbs_scale_keeps_native_geometry_camera_and_source_bytes(language, width):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, EVIDENCE / f"{language}-server.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": 850})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language', '{language}')")
        entry = page.request.get(f"{base}/api/examples/apbs.potential?profile=stat6")
        assert entry.ok
        pin = entry.json()["pin"]
        assert pin is not None, "The verified STAT6 bundle must contain the APBS result"
        identifier = pin["job_id"]
        job = page.request.get(f"{base}/api/jobs/{identifier}/result").json()
        assert job["operation"] == "electrostatics"
        files = [job["structure_artifact"], job["potential_artifact"]]
        assert all(files)
        prefix = f"{base}/api/jobs/{identifier}/download?"
        urls, errors, posts = [], [], []

        def requests(req):
            if req.method == "POST":
                posts.append(req.url)
            if req.method == "GET" and req.url.startswith(prefix):
                urls.append(req.url)

        page.on("request", requests)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("""window.__apbsLoads=0;
          window.addEventListener("message", event => {
            if (event.origin === location.origin && event.data?.channel === "opendde-viewer"
                && event.data.type === "loaded") window.__apbsLoads++;
          });""")
        page.goto(f"{base}/#task={identifier}")
        panel = page.locator(".viewer-panel")
        frame = panel.locator("iframe")
        legend = panel.locator(".potential-legend")
        capture = panel.get_by_role("button", name="生成三维视图图片" if zh else "Capture 3D view")
        expect(legend).to_contain_text("+5 kBT/e", timeout=30000)
        expect(capture).to_be_enabled()
        zoom = panel.get_by_role("button", name="放大" if zh else "Zoom in", exact=True)
        before_zoom = inspect_surface(frame)["camera"]
        zoom.click()
        page.wait_for_function("""camera => {
          const frame = document.querySelector(".viewer-panel iframe");
          const viewer = frame.contentDocument.querySelector("canvas")._3dmol_viewer;
          return JSON.stringify(viewer.getView()) !== JSON.stringify(camera);
        }""", arg=before_zoom)
        before = inspect_surface(frame, remember=True)
        source_urls = urls.copy()
        assert len(source_urls) == 2
        assert page.evaluate("window.__apbsLoads") == 1

        scale = page.get_by_role(
            "combobox", name="颜色范围" if zh else "Color range", exact=True
        )
        ranges = (10, 2, 5, 10)
        images = [before["png"]]
        for number in ranges:
            scale.select_option(str(number))
            expect(legend).to_contain_text(f"+{number} kBT/e")
            expect(capture).to_be_enabled()
            after = inspect_surface(frame)
            assert after["sameGeometry"]
            assert after["camera"] == before["camera"]
            assert after["png"] != images[-1]
            images.append(after["png"])
        assert images[0] == images[3]
        assert images[1] == images[-1]
        assert page.evaluate("window.__apbsLoads") == 1
        assert urls == source_urls
        for name in files:
            response = page.request.get(prefix.rstrip("?"), params={"name": name})
            original = Settings.from_env().state_dir / "jobs" / identifier / "output" / name
            assert response.ok and response.body() == original.read_bytes()
        assert not errors and not posts
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        panel.screenshot(path=EVIDENCE / f"{language}-retained-apbs.png")
        (EVIDENCE / f"{language}.json").write_text(json.dumps({
            "scene_loads": 1, "original_files": files, "camera": before["camera"],
            "geometry_retained": True, "ranges": [5, *ranges],
            "width": width, "posts": posts,
        }, indent=2), encoding="utf-8")
        browser.close()
