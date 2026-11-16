"""Closed UI scope cannot skip shared styles or start unrelated native DEL work."""

import runpy
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/target-evidence-scope.py")


def test_target_result_and_publication_companions():
    assert scope["selected"](scope["FILES"], css_safe=True)
    assert not scope["selected"](scope["FILES"])
    assert not scope["selected"]([], css_safe=True)
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch", css_safe=True)


@pytest.mark.parametrize("path", [
    "frontend/src/App.tsx", "frontend/src/presentation/ResearchTable.tsx",
    "frontend/src/discovery/ReferenceImportResults.tsx",
    "frontend/src/discovery/EvidenceSummary.tsx",
    "src/opendde_workbench/discovery/client.py",
    "server_tests/interaction_workspace_case.py",
])
def test_mixed_shared_changes_require_their_actual_consumers(path):
    assert not scope["selected"]([*scope["SOURCES"], path], css_safe=True)


def test_css_compares_only_the_exact_result_owned_selectors():
    shared = ".evidence-header { gap: 20px; }\n.library { display: grid; }"
    for selector in scope["SELECTORS"]:
        changed = shared + f"\n{selector} {{ gap: 8px; }}"
        assert scope["unrelated_css"](shared) == scope["unrelated_css"](changed)
    for selector in (
        ".target-evidence-results, .library", ".target-evidence-results + .library",
        ".library", ".evidence-header",
    ):
        changed = shared + f"\n{selector} {{ gap: 8px; }}"
        assert scope["unrelated_css"](shared) != scope["unrelated_css"](changed)
    nested = shared + "\n@media (width > 1px) { .library { gap: 8px; } }"
    assert scope["unrelated_css"](shared) != scope["unrelated_css"](nested)


def test_unrelated_dataset_and_native_del_jobs_are_delegated():
    workflow = Path(".github/workflows/dataset-discovery-checks.yml").read_text()
    for job in ("contracts", "native-del-data"):
        body = workflow.split(f"  {job}:", 1)[1].split("    steps:", 1)[0]
        assert "needs: target-ui-scope" in body
        assert "needs.target-ui-scope.outputs.target_evidence_only != 'true'" in body
    body = workflow.split("  discovery-evidence:", 1)[1].split("  source-inputs:", 1)[0]
    assert "server_tests/test_target_evidence_browser.py" in body
    assert "launch_review_browser" in Path("server_tests/test_target_evidence_browser.py").read_text()
    guidance = Path(".github/workflows/restraint-guidance-checks.yml").read_text()
    body = guidance.split("  frontend-guidance:", 1)[1].split("    steps:", 1)[0]
    assert "needs.scope.outputs.target_evidence_only != 'true'" in body
