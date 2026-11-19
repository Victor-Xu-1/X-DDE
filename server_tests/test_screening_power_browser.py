"""Exercise screening power in Chrome with isolated files and a simulated run receipt."""

from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from opendde_workbench.workflows.contracts import PlanInput
from server_tests.browser_platform import platform

EVIDENCE = Path("outputs/screening-power")
PLAN_ID = "31111111-1111-4111-8111-111111111111"
RUN_ID = "32222222-2222-4222-8222-222222222222"
PLAN_HASH = "a" * 64
WHEN = "2026-10-12T00:00:00Z"
PDB = b"""ATOM      1  N   GLY A   1      10.100  11.200  12.300  1.00 20.00           N
ATOM      2  CA  GLY A   1      11.200  11.800  12.600  1.00 20.00           C
ATOM      3  C   GLY A   1      12.300  12.100  13.700  1.00 20.00           C
TER
END
"""


def mock_receipt(page):
    calls = []
    run = {
        "id": RUN_ID, "plan_id": PLAN_ID, "state": "running",
        "reason": None, "created_at": WHEN, "attempts": [],
    }

    def workflow(route):
        request = route.request
        path = request.url.split("/api", 1)[1]
        if path == f"/workflows/runs/{RUN_ID}" and request.method == "GET":
            route.fulfill(json=run)
            return
        calls.append(path)
        assert request.method == "POST"
        body = request.post_data_json
        if path == "/workflows/plans":
            plan = PlanInput.model_validate(body)
            assert [step.id for step in plan.steps] == ["library", "index", "screen", "dock"]
            route.fulfill(json={"id": PLAN_ID, "body": body, "sha256": PLAN_HASH})
        else:
            assert path == f"/workflows/plans/{PLAN_ID}/runs"
            assert body == {"plan_sha256": PLAN_HASH}
            route.fulfill(json=run)

    page.route("**/api/workflows/**", workflow)
    return calls


def next_step(form):
    form.get_by_role("button", name="Next", exact=True).click()


def switch(form, engine):
    return form.locator(f'[data-engine="{engine}"]').get_by_role("switch")


def test_screening_stage_switches_stay_reachable_after_acceptance(tmp_path):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with platform(tmp_path / "state", EVIDENCE / "service.log") as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 390, "height": 920})
        for capability in ("drugclip.screen", "screening.dock", "library.import"):
            page.route(
                f"**/api/capabilities/{capability}",
                lambda route: route.fulfill(json={"availability": {"configuration_present": True}}),
            )
        mocked = mock_receipt(page)
        submitted = []

        def guard_jobs(route):
            if route.request.method == "POST":
                submitted.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        page.route("**/api/jobs", guard_jobs)
        page.goto(base + "/#view=new&tool=drugclip.screen")
        form = page.locator(".dataset-screening-form .questionnaire")
        entry = page.locator('[data-capability="drugclip.screen"]')
        expect(switch(entry, "drugclip")).not_to_be_checked()
        form.locator('input[type="file"]:visible').set_input_files(
            {"name": "target.pdb", "mimeType": "chemical/x-pdb", "buffer": PDB}
        )
        next_step(form)
        form.get_by_label("Where should the search run?").select_option("box")
        for axis in "XYZ":
            form.get_by_label(f"Center {axis} (Å)", exact=True).fill("11")
        next_step(form)
        expect(switch(form, "chemistry")).not_to_be_checked()
        expect(switch(form, "gnina")).to_have_count(0)
        form.get_by_role("button", name="Supplier or owned compound library").set_input_files(
            {"name": "library.csv", "mimeType": "text/csv", "buffer": b"ID,SMILES\n1,c1ccccc1\n"}
        )
        next_step(form)
        expect(switch(form, "chemistry")).to_be_visible()
        expect(switch(form, "gnina")).to_have_count(0)
        form.get_by_role("radio", name="Screen and dock", exact=False).check()
        expect(switch(form, "gnina")).not_to_be_checked()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=EVIDENCE / "plan-390.png")
        assert mocked == []
        form.get_by_role("button", name="Submit screening", exact=True).click()
        expect(form.get_by_role("region", name="Research plan run")).to_be_visible()
        expect(switch(entry, "drugclip")).to_be_visible()
        expect(switch(entry, "drugclip")).not_to_be_checked()
        for engine in ("chemistry", "gnina"):
            expect(switch(form, engine)).to_be_visible()
            expect(switch(form, engine)).not_to_be_checked()
        assert mocked == ["/workflows/plans", f"/workflows/plans/{PLAN_ID}/runs"]
        assert not submitted and page.request.get(base + "/api/jobs").json() == []
        engines = page.request.get(base + "/api/runtime-controls").json()["engines"]
        assert all(not engine["enabled"] and not engine["active"] for engine in engines)
        page.screenshot(path=EVIDENCE / "accepted-390.png")
        browser.close()
