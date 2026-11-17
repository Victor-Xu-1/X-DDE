"""Closed shared-tab routing keeps unrelated result, source and compute checks active."""

import os
import runpy
import subprocess
import sys
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/research-tabs-scope.py")
selected = scope["selected"]


@pytest.mark.parametrize("path", sorted(scope["SOURCES"]))
@pytest.mark.parametrize("event", ["push", "pull_request"])
def test_tab_source_and_its_direct_checks_select_without_model_execution(path, event):
    assert selected({path} | (scope["FILES"] - scope["SOURCES"]), event)


@pytest.mark.parametrize("path", [
    "frontend/src/presentation/ActiveIndicator.tsx",
    "frontend/src/presentation/useReveal.ts",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/discovery/EvidenceSummary.tsx",
    "frontend/src/viewer/PoseSession.tsx",
    "frontend/src/guided/questionnaire.css",
    "frontend/src/design/layout.css",
    "src/opendde_workbench/backends/chemistry.py",
    "server_tests/test_pose_handoff_browser.py",
    ".github/workflows/user-interface-checks.yml",
    "scripts/other-scope.py",
    "frontend/src/presentation/ResearchTabs.tsx.backup",
])
def test_any_unowned_change_preserves_existing_workflow_obligations(path):
    assert not selected(scope["FILES"] | {path})


@pytest.mark.parametrize("event", ["workflow_dispatch", "workflow_call", "", "schedule"])
def test_other_events_never_narrow_the_original_checks(event):
    assert not selected(scope["FILES"], event)


def test_counter_or_routing_alone_does_not_claim_a_tab_change():
    assert not selected(scope["FILES"] - scope["SOURCES"])
    assert not selected([])


@pytest.mark.parametrize("event,ref", [
    ("push", "refs/heads/main"),
    ("push", "refs/heads/tab-fix"),
    ("pull_request", "refs/pull/1/merge"),
])
def test_real_entrypoint_uses_the_whole_reviewed_diff_for_push_and_pr(tmp_path, event, ref):
    script = Path("scripts/research-tabs-scope.py").resolve()
    repo = tmp_path / "repo"
    repo.mkdir()

    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

    git("init", "-b", "main")
    git("config", "user.name", "Scoped CI fixture")
    git("config", "user.email", "fixture@example.invalid")
    git("commit", "--allow-empty", "-m", "base")
    base = git("rev-parse", "HEAD")
    git("update-ref", "refs/remotes/origin/main", base)
    path = repo / "frontend/src/presentation/ResearchTabs.tsx"
    path.parent.mkdir(parents=True)
    path.write_text("tab selection fixture\n")
    git("add", ".")
    git("commit", "-m", "tab change")
    first = git("rev-parse", "HEAD")
    (repo / "pyproject.toml").write_text("publication counter fixture\n")
    git("add", ".")
    git("commit", "-m", "metadata fixup")
    output = tmp_path / "output"
    env = {
        **os.environ,
        "BASE": base if ref == "refs/heads/main" else first,
        "GITHUB_REF": ref,
        "GITHUB_EVENT_NAME": event,
        "GITHUB_OUTPUT": str(output),
    }
    subprocess.run([sys.executable, str(script)], cwd=repo, env=env, check=True)
    assert output.read_text() == "research_tabs_only=true\n"
    (repo / "unowned-backend.py").write_text("unowned\n")
    git("add", ".")
    git("commit", "-m", "mixed change")
    output.write_text("")
    result = subprocess.run([sys.executable, str(script)], cwd=repo, env=env, capture_output=True)
    assert result.returncode != 0
    assert b"Mixed shared-tab changes" in result.stderr
    assert output.read_text() == ""


def test_pose_workflow_retains_units_and_docking_but_never_minimizes_in_tab_mode():
    workflow = Path(".github/workflows/pose-handoff-checks.yml").read_text()
    for name in [
        "Isolated native Chemistry and existing managed Ketcher",
        "Real STAT6 pose, current/original versions, undo/redo, form navigation and downloads",
    ]:
        step = workflow.split("- name: " + name, 1)[1].split("      - ", 1)[0]
        assert "needs.refinement-scope.outputs.research_tabs_only != 'true'" in step
    for name in [
        "Pose controller, explicit choices, record identity and direct research consumers",
        "Bilingual native docking table, linked fullscreen and complete original downloads",
    ]:
        step = workflow.split("- name: " + name, 1)[1].split("      - ", 1)[0]
        assert "research_tabs_only" not in step
    assert "src/presentation/ResearchTabs.test.tsx" in workflow
    assert "python -m pytest -q server_tests/test_docking_table_browser.py" in workflow
