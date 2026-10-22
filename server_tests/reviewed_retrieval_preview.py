"""Replay the accepted pocket-retrieval result and its own derived minima."""

import hashlib

from example_preview_actions import choose_task, ready_structure
from playwright.sync_api import expect


def review_retrieval_example(page, base, language, evidence):
    zh = language == "zh"
    choose_task(page, language, "drugclip.screen")
    detail = page.request.get(base + "/api/examples/drugclip.screen").json()
    assert detail["pin"]["job_id"] == "8f0e8e38-02d1-4753-a736-6d0619355967"
    stages = detail["supporting_stage_names"]
    assert len(stages) == 2 and len(set(stages.values())) == 2
    assert "CHEMBL517122" in stages["63cdb6e0-a698-4b44-8d1f-127e88782b13"]
    assert "CHEMBL458325" in stages["636bee83-ae2f-4b2e-8f52-36ca6031068c"]
    candidate = page.locator(".dataset-preview-pane")
    expect(candidate.locator(".dataset-panel-title strong")).to_have_text("CHEMBL517122")
    ready_structure(page, zh)
    page.get_by_role("button", name="CHEMBL458325", exact=True).click()
    expect(candidate.locator(".dataset-panel-title strong")).to_have_text("CHEMBL458325")
    ready_structure(page, zh)
    assert not page.get_by_label(
        "Pose 优化与历史" if zh else "Pose optimization and history", exact=True
    ).count()
    with page.expect_download() as transfer:
        candidate.get_by_role(
            "link", name="下载原始结果结构" if zh else "Download original result structure"
        ).click()
    native = evidence / "CHEMBL458325-retrieval-native.sdf"
    transfer.value.save_as(native)
    assert hashlib.sha256(native.read_bytes()).hexdigest() == (
        "22330bc411935a6005b09d7e420b544fd5883fff4ae436d0721d99367205c6cb"
    )
    candidate.get_by_role("tab", name="二维结构" if zh else "2D structure").click()
    drawing = candidate.locator(".molecule-image:visible")
    expect(drawing).to_have_attribute("data-drawing-state", "ready", timeout=60000)
    drawing.locator("img").evaluate("image => image.decode()")
    page.screenshot(path=str(evidence / "retrieval-unknown-stereo-2d.png"), full_page=True)
    stage = page.get_by_label("研究阶段结果" if zh else "Study result stage", exact=True)
    for identifier, label in stages.items():
        assert "cmp-" not in label
        stage.select_option(identifier)
        expect(
            page.get_by_role(
                "region", name="能量最小化结果" if zh else "Energy minimization results"
            )
        ).to_be_visible()
        ready_structure(page, zh)
    page.screenshot(path=str(evidence / "retrieval-retained-minimum.png"), full_page=True)
    return stages
