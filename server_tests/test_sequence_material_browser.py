"""Public STAT6-pathway antibody inputs through the real file/version service; no science."""

import hashlib
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.store import Store
from server_tests.browser_platform import platform


def capture(page, path):
    """Capture the document from its verified top after native focus/step scrolling."""
    page.evaluate("""() => {
        window.scrollTo({top:0, left:0, behavior:'instant'});
        return new Promise(resolve => requestAnimationFrame(
            () => requestAnimationFrame(resolve)));
    }""")
    assert page.evaluate("window.scrollY") == 0
    assert page.locator(".studio-topbar").bounding_box()["y"] < 40
    page.screenshot(path=path, full_page=True)


@pytest.mark.parametrize("language,width,theme", [("en", 1280, "warm"), ("zh", 390, "dark")])
def test_sequence_material_retention_explicit_retry_and_real_consumers(
    tmp_path, language, width, theme
):
    root = Path("outputs/material-input") / ("sequence-" + language)
    root.mkdir(parents=True, exist_ok=True)
    state = tmp_path / "state"
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    raw = verified_input("dupilumab_variable_domains")
    text = raw.decode()
    historical = assets.save("6WGL-dupilumab-variable-domains.fasta", "sequences", raw)
    zh = language == "zh"
    with platform(state, root / "service.log") as base, sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.add_init_script(
            f"if(location.origin === {json.dumps(base)}) {{"
            f"localStorage.setItem('opendde-workbench.language','{language}');"
            f"localStorage.setItem('x-dde-theme','{theme}');}}"
        )
        errors, science, versions, uploads, held = [], [], [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def observe(request):
            if request.method != "POST":
                return
            if any(
                part in request.url for part in ("/api/jobs", "/api/batches", "/poses/minimize")
            ):
                science.append(request.url)
            if "/api/assets?" in request.url:
                uploads.append(request.url)

        page.on("request", observe)
        page.goto(base + "/#view=new&tool=antibody.humanize")
        expect(page.locator("html")).to_have_attribute("data-theme", theme)
        panel = page.get_by_role(
            "region",
            name="抗体人源参考与框架优化"
            if zh
            else "Antibody human reference and framework proposals",
            exact=True,
        )
        material = panel.locator('.reference-material[data-material-kind="sequences"]')
        paste = material.get_by_role(
            "radio", name="粘贴序列" if zh else "Paste sequences", exact=True
        )
        history = material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        )
        upload = material.get_by_role(
            "radio", name="上传 FASTA 文件" if zh else "Upload FASTA file", exact=True
        )
        textbox = material.get_by_role(
            "textbox", name="序列或 FASTA" if zh else "Sequence or FASTA"
        )
        confirm = material.get_by_role(
            "button", name="确认序列" if zh else "Confirm sequences", exact=True
        )
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(paste).to_be_checked()
        expect(next_button).to_be_disabled()
        textbox.fill(text)
        for source in (upload, history):
            source.check()
            paste.check()
            expect(textbox).to_have_value(text)
            expect(next_button).to_be_disabled()
        assert not versions and not uploads
        # The local bundled face must load; a CSS family name alone is insufficient evidence.
        assert page.evaluate(
            "async () => (await document.fonts.load('500 12px \"JetBrains Mono\"')).length > 0"
        )
        style = textbox.evaluate("""e => {
            const s=getComputedStyle(e); return {
                font:s.fontFamily, size:s.fontSize, padding:s.padding,
                radius:s.borderRadius, height:e.getBoundingClientRect().height};
        }""")
        assert "JetBrains Mono" in style["font"]
        assert style["size"] == "12px" and style["padding"] == "14px"
        assert style["radius"] == "8px" and 128 <= style["height"] <= 132
        actions = panel.locator(".questionnaire-actions")
        assert actions.evaluate("e => getComputedStyle(e).position") == "static"
        assert (
            actions.bounding_box()["y"]
            >= confirm.bounding_box()["y"] + confirm.bounding_box()["height"]
        )
        if width <= 640:
            labels = material.locator(".questionnaire-choices label")
            boxes = [label.bounding_box() for label in labels.all()]
            assert len(boxes) == 3 and all(box["height"] >= 44 for box in boxes)
            assert max(box["y"] for box in boxes) - min(box["y"] for box in boxes) < 1
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        capture(page, root / "sequence-paste.png")

        def uncertain_first_reply(route):
            if route.request.method != "POST":
                route.continue_()
                return
            response = route.fetch()
            assert response.ok
            versions.append((route.request.headers["idempotency-key"], response.json()))
            if len(versions) == 1:
                route.abort("failed")
            else:
                route.fulfill(response=response)

        page.route("**/api/research/objects", uncertain_first_reply)
        confirm.click()
        expect(material.get_by_role("alert")).to_contain_text(
            "未能确认序列是否保存" if zh else "Sequence saving could not be confirmed"
        )
        expect(next_button).to_be_disabled()
        confirm.click()
        expect(next_button).to_be_enabled()
        assert len(versions) == 2 and versions[0] == versions[1]
        assert len(uploads) == 1
        reference = versions[1][1]["reference"]
        assert reference["sha256"] == hashlib.sha256(raw).hexdigest()
        assert reference["record"] == reference["conformer"] == 0
        history.check()
        picker = material.get_by_role("combobox")
        picker.select_option("file:" + historical.id)
        expect(next_button).to_be_enabled()
        paste.check()
        expect(textbox).to_have_value(text)
        expect(confirm).to_be_disabled()
        expect(next_button).to_be_enabled()
        next_button.click()
        panel.get_by_role("button", name="上一步" if zh else "Back", exact=True).click()
        expect(textbox).to_have_value(text)
        expect(next_button).to_be_enabled()

        # A real upload can complete after leaving paste; it must not register/replace history.
        changed = text.rstrip() + "A\n"
        textbox.fill(changed)
        expect(next_button).to_be_disabled()

        def hold_upload(route):
            held.append((route, route.fetch()))

        page.route("**/api/assets?*", hold_upload)
        confirm.click()
        expect(
            material.get_by_role("button", name="正在保存…" if zh else "Saving…")
        ).to_be_disabled()
        history.check()
        expect(picker).to_be_enabled()
        expect(picker).to_have_value("file:" + historical.id)
        expect(next_button).to_be_enabled()
        assert len(held) == 1
        for route, response in held:
            with page.expect_response(
                lambda reply: reply.request.method == "POST" and "/api/assets?" in reply.url
            ):
                route.fulfill(response=response)
        expect(picker).to_have_value("file:" + historical.id)
        expect(next_button).to_be_enabled()
        paste.check()
        expect(textbox).to_have_value(changed)
        expect(confirm).to_be_enabled()
        expect(next_button).to_be_disabled()
        assert len(versions) == 2
        capture(page, root / "sequence-restored.png")
        page.unroute("**/api/assets?*", hold_upload)

        # The second real consumer uploads FASTA through the same source control.
        page.goto(base + "/#view=new&tool=antibody.number")
        panel = page.get_by_role(
            "region",
            name="抗体编号与 CDR 标注" if zh else "Antibody numbering and CDR annotation",
            exact=True,
        )
        material = panel.locator('.reference-material[data-material-kind="sequences"]')
        expect(
            material.get_by_role("radio", name="粘贴序列" if zh else "Paste sequences", exact=True)
        ).to_be_checked()
        material.get_by_role(
            "radio", name="上传 FASTA 文件" if zh else "Upload FASTA file", exact=True
        ).check()
        material.locator('input[type="file"]').set_input_files(
            {"name": "6WGL-numbering.fasta", "mimeType": "text/plain", "buffer": raw}
        )
        next_button = panel.get_by_role("button", name="下一步" if zh else "Next", exact=True)
        expect(next_button).to_be_enabled()
        material.get_by_role(
            "radio", name="历史文件" if zh else "Historical files", exact=True
        ).check()
        expect(next_button).to_be_disabled()
        material.get_by_role(
            "radio", name="上传 FASTA 文件" if zh else "Upload FASTA file", exact=True
        ).check()
        expect(next_button).to_be_enabled()
        capture(page, root / "numbering-upload.png")
        assert (
            hashlib.sha256(
                page.request.get(base + "/api/assets/" + reference["asset_id"]).body()
            ).hexdigest()
            == reference["sha256"]
        )
        assert not errors and not science and not store.list_jobs(), (errors, science)
        (root / "receipt.json").write_text(
            json.dumps(
                {
                    "language": language,
                    "width": width,
                    "theme": theme,
                    "source_sha256": historical.sha256,
                    "confirmed_reference": reference,
                    "explicit_retry_same_identity": True,
                    "late_upload_ignored": True,
                    "source_draft_restored": True,
                    "textarea_style": style,
                    "scientific_jobs": 0,
                },
                indent=2,
            )
        )
        browser.close()
