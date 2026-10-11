"""Real STAT6 source versions and delayed/lost replies; never calculate science."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.settings import Settings
from server_tests.browser_platform import platform
from server_tests.test_navigation_shell_browser import open_navigation


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_annotation_save_preserves_new_selection_and_recovers_one_exact_version(language, width):
    cases = json.loads(Path("outputs/workspace-preview/cases.json").read_text())
    original, other = cases["study_ligand"], cases["study_protac"]
    evidence = Path("outputs/workspace-preview/version-recovery") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(Settings.from_env().state_dir, evidence / "service.log") as base,
        sync_playwright() as driver,
    ):
        browser = driver.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.add_init_script(f"localStorage.setItem('opendde-workbench.language','{language}')")
        errors, submissions = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda req: (
                submissions.append(req.url)
                if req.method == "POST" and req.url.endswith("/api/jobs")
                else None
            ),
        )
        page.goto(base)
        before_jobs = page.request.get(base + "/api/jobs").json()
        before_file = page.request.get(
            base + "/api/assets/" + original["reference"]["asset_id"]
        ).body()
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        files = page.get_by_role(
            "list", name="资产与任务" if zh else "Assets and tasks", exact=True
        )

        def choose(value):
            files.get_by_role(
                "button", name=("分子: " if zh else "Molecule: ") + value["label"], exact=True
            ).click()
            expect(page.get_by_role("heading", name=value["label"], exact=True)).to_be_visible()

        def edit(name):
            choose(original)
            page.get_by_text(
                "名称、备注与人工评价" if zh else "Name, notes & human rating", exact=True
            ).click()
            page.get_by_role("textbox", name="名称" if zh else "Name", exact=True).fill(name)

        url = base + "/api/research/objects"
        held = []

        def hold(route):
            response = route.fetch()
            assert response.ok
            held.append((route, response))

        name = f"STAT6 annotation · delayed reply · {language}"
        edit(name)
        page.route(url, hold)
        save = page.get_by_role(
            "button", name="保存备注为新版本" if zh else "Save notes as new version", exact=True
        )
        save.click()
        expect(save).to_be_disabled()
        expect(
            page.get_by_role("textbox", name="名称" if zh else "Name", exact=True)
        ).to_be_disabled()
        choose(other)
        assert len(held) == 1
        held[0][0].fulfill(response=held[0][1])
        page.unroute(url, hold)
        expect(
            files.get_by_role("button", name=("分子: " if zh else "Molecule: ") + name, exact=True)
        ).to_be_visible()
        expect(page.get_by_role("heading", name=other["label"], exact=True)).to_be_visible()
        page.screenshot(path=evidence / "newer-selection-retained.png")

        retry_name = f"STAT6 annotation · uncertain reply · {language}"
        edit(retry_name)
        keys = []

        def lose(route):
            keys.append(route.request.headers.get("idempotency-key"))
            response = route.fetch()
            assert response.ok
            route.fulfill(status=503, json={"detail": "Controlled /private/internal failure"})

        page.route(url, lose)
        save.click()
        expect(page.get_by_role("alert")).to_contain_text(
            "未能确认研究操作" if zh else "research action could not be confirmed"
        )
        expect(page.get_by_role("alert")).not_to_contain_text("/private")
        after_lost = page.request.get(url).json()
        page.unroute(url, lose)
        page.route(
            url,
            lambda route: (
                keys.append(route.request.headers.get("idempotency-key")),
                route.continue_(),
            ),
        )
        save.click()
        expect(page.get_by_role("heading", name=retry_name, exact=True)).to_be_visible()
        assert page.request.get(url).json() == after_lost
        assert len(keys) == 2 and keys[0] and keys[0] == keys[1]
        assert (
            page.request.get(base + "/api/assets/" + original["reference"]["asset_id"]).body()
            == before_file
        )
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert not errors and not submissions
        page.screenshot(path=evidence / "same-version-recovered.png")
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "original_version": original["id"],
                    "source_sha256": hashlib.sha256(before_file).hexdigest(),
                    "new_selection_retained": True,
                    "lost_reply_same_version": True,
                    "scientific_jobs_submitted": 0,
                },
                indent=2,
            )
        )
        browser.close()
