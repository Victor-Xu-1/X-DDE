"""Real STAT6 source versions and delayed/lost replies; never calculate science."""

import hashlib
import json
from pathlib import Path
from uuid import uuid4

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

        normalized_notes = "Reviewed source identity.\nOriginal material retained."
        raw_notes = " \n" + normalized_notes + "\n\u0085\u00a0"

        def edit(name):
            choose(original)
            page.get_by_text(
                "名称、备注与人工评价" if zh else "Name, notes & human rating", exact=True
            ).click()
            page.get_by_role("textbox", name="名称" if zh else "Name", exact=True).fill(name)
            page.get_by_role(
                "textbox", name="研究备注" if zh else "Research notes", exact=True
            ).fill(raw_notes)

        url = base + "/api/research/objects"
        held = []
        held_marker = f"xdde:test:annotation-reply-held:{uuid4()}"

        def hold(route):
            response = route.fetch()
            assert response.ok
            held.append((route, response))
            page.evaluate("marker => console.debug(marker)", held_marker)

        name = f"STAT6 annotation · delayed reply · {language}"
        edit(name)
        page.route(url, hold)
        save = page.get_by_role(
            "button", name="保存备注为新版本" if zh else "Save notes as new version", exact=True
        )
        with page.expect_console_message(
            predicate=lambda message: message.type == "debug" and message.text == held_marker
        ):
            save.click()
            expect(save).to_be_disabled()
            expect(
                page.get_by_role("textbox", name="名称" if zh else "Name", exact=True)
            ).to_be_disabled()
        choose(other)
        assert len(held) == 1
        assert held[0][1].json()["notes"] == normalized_notes
        held[0][0].fulfill(response=held[0][1])
        page.unroute(url, hold)
        (evidence / "delayed-save-response.json").write_text(
            json.dumps(held[0][1].json(), indent=2)
        )
        page.screenshot(path=evidence / "delayed-reply-state.png")
        (evidence / "delayed-reply-state.txt").write_text(page.get_by_role("main").inner_text())
        expect(
            files.get_by_role("button", name=("分子: " if zh else "Molecule: ") + name, exact=True)
        ).to_be_visible()
        expect(page.get_by_role("heading", name=other["label"], exact=True)).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
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
        saved_versions = [item for item in after_lost if item["label"] == retry_name]
        assert len(saved_versions) == 1
        assert saved_versions[0]["notes"] == normalized_notes
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
        expect(page.get_by_role("alert")).to_have_count(0)
        page.get_by_text(
            "名称、备注与人工评价" if zh else "Name, notes & human rating", exact=True
        ).click()
        expect(
            page.get_by_role("textbox", name="研究备注" if zh else "Research notes", exact=True)
        ).to_have_value(normalized_notes)
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
                    "surrounding_whitespace_saved": True,
                    "internal_newline_preserved": True,
                    "scientific_jobs_submitted": 0,
                },
                indent=2,
            )
        )
        browser.close()


@pytest.mark.parametrize("language,width", [("en", 1440), ("zh", 390)])
def test_relationship_refresh_and_retry_preserve_earlier_versions(language, width):
    """Real tiny file/SQLite history, controlled read failure, zero scientific tasks."""
    from urllib.parse import quote

    from opendde_workbench.assets import AssetStore
    from opendde_workbench.research.contracts import VersionInput
    from opendde_workbench.research.graph import graph
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.store import Store

    state = Settings.from_env().state_dir
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    versions = ScientificStore(store, assets)
    asset = assets.save("relationship-control.fasta", "sequences", b">controlled\nAAAA\n")
    suffix = str(uuid4())[:8]

    def version_input(label, parent=None):
        return VersionInput(asset_id=asset.id, kind="sequence", label=label, parent_id=parent)

    source = versions.create(version_input(f"Relationship source {suffix}"), uuid4())
    earlier = versions.create(version_input(f"Earlier reviewed notes {suffix}", source.id), uuid4())
    versions.create_many(
        [(version_input(f"Unrelated history {suffix} {i}"), uuid4()) for i in range(199)]
    )
    versions.create(version_input(f"Latest reviewed notes {suffix}", source.id), uuid4())
    focus = "object:" + str(source.id)
    earlier_id = "object:" + str(earlier.id)
    recent, focused = graph(store), graph(store, focus=focus)
    assert focus in {node["id"] for node in recent["nodes"]}
    assert earlier_id not in {node["id"] for node in recent["nodes"]}
    assert earlier_id in {node["id"] for node in focused["nodes"]}
    evidence = Path("outputs/workspace-preview/relationship-recovery") / language
    evidence.mkdir(parents=True, exist_ok=True)
    zh = language == "zh"
    with (
        platform(state, evidence / "service.log") as base,
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
        open_navigation(page, language).get_by_role(
            "button", name="研究空间" if zh else "Research workspace", exact=True
        ).click()
        page.get_by_role("button", name="研究文件" if zh else "Research files", exact=True).click()
        page.get_by_role(
            "searchbox", name="查找研究文件或任务" if zh else "Find research files or tasks"
        ).fill(source.label)
        source_button = page.get_by_role(
            "list", name="资产与任务" if zh else "Assets and tasks", exact=True
        ).get_by_role("button", name=("序列: " if zh else "Sequence: ") + source.label, exact=True)
        source_button.click()
        relation = page.locator(".research-inspector .research-relations").get_by_role(
            "button", name=earlier.label, exact=True
        )
        expect(relation).to_be_visible()
        focus_url = base + "/api/research/graph?focus=" + quote(focus, safe="")
        with page.expect_response(focus_url):
            page.get_by_role("button", name="刷新" if zh else "Refresh", exact=True).click()
        expect(relation).to_be_visible()
        expect(page.get_by_role("heading", name=source.label, exact=True)).to_be_visible()
        page.screenshot(path=evidence / "refreshed-relationships.png")

        failed_reads = []

        def fail_focus(route):
            failed_reads.append(route.request.url)
            route.fulfill(status=503, json={"detail": "Controlled focus read failure"})

        page.route(focus_url, fail_focus)
        source_button.click()
        alert = page.get_by_role("alert")
        expect(alert).to_contain_text(
            "无法刷新所选材料" if zh else "selected material could not be refreshed"
        )
        page.screenshot(path=evidence / "focus-read-failed.png")
        page.unroute(focus_url, fail_focus)
        with page.expect_response(focus_url):
            alert.get_by_role("button", name="重试" if zh else "Retry", exact=True).click()
        expect(alert).to_have_count(0)
        expect(relation).to_be_visible()
        expect(page.get_by_role("heading", name=source.label, exact=True)).to_be_visible()
        assert len(failed_reads) == 1
        assert page.request.get(base + "/api/jobs").json() == before_jobs
        assert page.request.get(base + "/api/assets/" + asset.id).body() == b">controlled\nAAAA\n"
        assert not errors and not submissions
        page.screenshot(path=evidence / "retry-restored-relationships.png")
        (evidence / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "fixture": "Controlled 17-byte FASTA and 202 real SQLite versions",
                    "source_version": str(source.id),
                    "earlier_version": str(earlier.id),
                    "source_sha256": asset.sha256,
                    "refresh_retained_relationship": True,
                    "retry_reread_focus": True,
                    "scientific_jobs_submitted": 0,
                },
                indent=2,
            )
        )
        browser.close()
