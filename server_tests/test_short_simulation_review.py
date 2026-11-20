"""Check the first screen of two archived native simulation results in Chrome."""

import json
import sqlite3
from base64 import b64encode
from contextlib import closing
from hashlib import sha256
from pathlib import Path
from shutil import copytree

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.requests import TASK_ADAPTER
from server_tests.browser_platform import platform
from server_tests.test_simulation_structure_focus import verify_frame

STAGE = ".simulation-webgl"
READY = f'{STAGE}[data-loaded="true"][aria-busy="false"]:not([data-error])'

MOLECULAR_PIXELS = """async (encoded) => {
    const image = await createImageBitmap(new Blob(
        [Uint8Array.from(atob(encoded), char => char.charCodeAt(0))],
        {type: "image/png"},
    ));
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const {data} = context.getImageData(10, 10, image.width - 20, image.height - 20);
    let colored = 0;
    for (let index = 0; index < data.length; index += 4) {
        const rgb = [data[index], data[index + 1], data[index + 2]];
        const light = Math.max(...rgb), dark = Math.min(...rgb);
        if (light - dark >= 24 && dark < 225) colored++;
    }
    return colored;
}"""


def check_first_screen(page, root, count=1):
    scenes = root.locator(READY)
    expect(scenes).to_have_count(count, timeout=45000)
    boxes = []
    for scene in scenes.all():
        expect(scene).to_be_in_viewport(ratio=0.99)
        box = scene.bounding_box()
        assert box and box["height"] >= (330 if count == 1 else 276), box
        boxes.append(box)
        png = scene.screenshot()
        colored = page.evaluate(MOLECULAR_PIXELS, b64encode(png).decode())
        assert colored > 120, {"visible_native_pixels": colored, "box": box}
    return boxes


@pytest.mark.parametrize(("language", "width", "height"), [
    ("en", 1180, 720),
    ("zh", 1280, 800),
])
@pytest.mark.parametrize("case", ["openmm.dynamics", "openfe.rbfe"])
def test_short_native_results(case, language, width, height):
    source = Path("outputs/native-simulations") / case
    identifier = (source / "job-id.txt").read_text().strip()
    evidence = source / "browser" / "short-desktop"
    evidence.mkdir(parents=True, exist_ok=True)
    dynamics = case == "openmm.dynamics"
    zh = language == "zh"
    theme = "dark" if zh else "warm"
    with platform(source / "state", evidence / "app.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        page.add_init_script(
            f"localStorage.setItem('opendde-workbench.language', '{language}');"
            f"localStorage.setItem('x-dde-theme', '{theme}');"
        )
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda req: writes.append(req.url)
            if req.method not in {"GET", "HEAD", "OPTIONS"} and "/api/" in req.url
            else None,
        )
        result_url = f"{base}/api/jobs/{identifier}/result"
        result = page.request.get(result_url).json()
        page.goto(f"{base}/#task={identifier}")
        root = page.get_by_test_id("dynamics-results" if dynamics else "free-energy-results")
        stage = check_first_screen(page, root)[0]
        rail = root.locator(".structure-workbench-details").bounding_box()
        assert rail and stage["x"] + stage["width"] < rail["x"]
        assert page.evaluate(
            "window.scrollY === 0 && document.documentElement.scrollWidth <= innerWidth"
        )
        page.screenshot(path=evidence / f"initial-{language}-{width}.png")
        if dynamics:
            first_canvas = root.locator(READY + " canvas").element_handle()
            verify_frame(page, base, root, result, zh)
            check_first_screen(page, root)
            assert root.locator(READY + " canvas").evaluate(
                "(canvas, original) => canvas === original", first_canvas,
            )
        else:
            assert result["free_energy"]["stage"] == "plan"
            viewport = root.get_by_test_id("molstar-viewport")
            expect(viewport).to_have_attribute("data-ligand", "all")
            root.get_by_role("button", name="A / B 并列" if zh else "A / B side by side").click()
            a, b = check_first_screen(page, root, 2)
            assert a["x"] + a["width"] < b["x"] and abs(a["y"] - b["y"]) < 2, (a, b)
            page.screenshot(path=evidence / f"pair-{language}-{width}.png")
            root.get_by_role("button", name="叠加查看" if zh else "Overlay", exact=True).click()
            select = root.get_by_role("combobox",
                name="结合姿势显示" if zh else "Binding pose display",
            )
            select.select_option("b")
            expect(viewport).to_have_attribute("data-ligand", "b")
            check_first_screen(page, root)
        assert page.request.get(result_url).json() == result
        runtime = page.request.get(base + "/api/runtime-controls?include_native=false").json()
        assert all(not engine["enabled"] and not engine["active"] for engine in runtime["engines"])
        assert not writes and not errors, {"writes": writes, "errors": errors}
        browser.close()


def prepare_protein_only_fixture(source, state):
    # Keep the archived coordinates and derive a protein-only, two-repeat view fixture.
    # The same native frames are replayed under a separate test-only repeat identity.
    identifier = (source / "job-id.txt").read_text().strip()
    copytree(source / "state", state)
    output = state / "jobs" / identifier / "output"
    result_file = output / "result.json"
    result = json.loads(result_file.read_text())
    original = result["dynamics"]["replicas"][0]
    replicas = []
    for index in range(2):
        frames = []
        for frame in original["frames"]:
            source_file = output / frame["artifact"]
            content = b"".join(
                line for line in source_file.read_bytes().splitlines(keepends=True)
                if not line.startswith((b"HETATM", b"CONECT"))
            )
            name = f"protein-only-view-{index + 1}-{source_file.name}"
            (output / name).write_bytes(content)
            result["artifact_sha256"][name] = sha256(content).hexdigest()
            frames.append({**frame, "artifact": name, "ligand_rmsd_angstrom": None})
        replicas.append({**original, "repeat": index + 1, "frames": frames, "contacts": []})
    result["dynamics"]["replicas"] = replicas
    with closing(sqlite3.connect(state / "jobs.sqlite3")) as db, db:
        text, parent = db.execute(
            "SELECT request, parent_id FROM jobs WHERE id = ?", (identifier,),
        ).fetchone()
        request = json.loads(text)
        request["payload"]["repeats"] = len(replicas)
        body = TASK_ADAPTER.validate_python(request).model_dump_json()
        digest = sha256((body + (parent or "")).encode()).hexdigest()
        db.execute(
            "UPDATE jobs SET request = ?, request_hash = ? WHERE id = ?",
            (body, digest, identifier),
        )
    result["request_sha256"] = sha256(body.encode()).hexdigest()
    result_file.write_text(json.dumps(result), encoding="utf-8")
    return identifier, replicas


def test_restore_protein_after_switching_repeat_with_hidden_layers(tmp_path):
    source = Path("outputs/native-simulations/openmm.dynamics")
    state = tmp_path / "state"
    identifier, replicas = prepare_protein_only_fixture(source, state)
    with platform(state, tmp_path / "app.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(f"{base}/#task={identifier}")
        root = page.get_by_test_id("dynamics-results")
        expect(root.locator(READY)).to_have_count(1, timeout=45000)
        original_canvas = root.locator(READY + " canvas").element_handle()
        protein = root.get_by_role("button", name="Protein", exact=True)
        protein.click()
        expect(protein).to_have_attribute("aria-pressed", "false")
        root.get_by_role("combobox", name="Independent repeat").select_option("1")
        expect(root.get_by_role("link", name="Download frame", exact=True)).to_have_attribute(
            "href", f"/api/jobs/{identifier}/download?name={replicas[1]['frames'][0]['artifact']}",
        )
        expect(root.locator(READY)).to_have_count(1, timeout=15000)
        assert root.locator(READY + " canvas").evaluate(
            "(canvas, original) => canvas !== original", original_canvas,
        )
        expect(protein).to_have_attribute("aria-pressed", "false")
        protein.click()
        expect(protein).to_have_attribute("aria-pressed", "true")
        scene = root.locator(READY)
        expect(scene).to_have_count(1, timeout=15000)
        encoded = b64encode(scene.screenshot()).decode()
        assert page.evaluate(MOLECULAR_PIXELS, encoded) > 120
        browser.close()
