"""Palette delegation must not hide unrelated layout or scientific changes."""

import runpy
from pathlib import Path

import pytest

M = runpy.run_path("scripts/appearance-scope.py")


def test_palette_and_publication_only():
    assert M["selected"](M["FILES"] - {M["WORKSPACES"], M["PREFERENCES"], M["NAVIGATION"]})
    assert M["selected"](["frontend/src/theme.warm.test.ts"])
    assert M["selected"](["server_tests/test_appearance_browser.py"])


@pytest.mark.parametrize(
    "path",
    [
        "src/opendde_workbench/integrations/runtime.py",
        "frontend/src/App.tsx",
        "frontend/src/guided/Questionnaire.tsx",
        "frontend/src/viewer/frame.ts",
        "frontend/src/design/layout.css",
        "frontend/src/theme-unrelated.ts",
    ],
)
def test_mixed_changes_keep_their_own_checks(path):
    assert not M["selected"]([*M["SOURCES"], path])


def test_shared_workspace_requires_exact_theme_cleanup():
    old = "main { grid-template-columns: 1fr; }\n" + "\n".join(M["CLEANUPS"])
    new = old
    for source, replacement in M["CLEANUPS"].items():
        new = new.replace(source, replacement)
    paths = ["frontend/src/tokens.css", M["WORKSPACES"]]
    assert M["selected"](paths, before=old, after=new)
    assert not M["selected"](paths)
    assert not M["selected"](paths, before=old, after=new.replace("1fr;", "3fr;"))
    assert not M["selected"](paths, before=new, after=new)


def test_no_source_or_explicit_dispatch_does_not_delegate():
    assert not M["selected"](["pyproject.toml"])
    assert not M["selected"](M["SOURCES"], "workflow_dispatch")


def test_shared_preference_cleanup_preserves_other_controls():
    old = (
        ".management-card { margin: 20px; }\n.theme-options { display: grid; }\n"
        '.studio-app .studio-topbar .global-search input[type="search"] { border: 0; }\n'
        ".theme-option > input { position: absolute; }\n"
        ".preference-warning { color: var(--warning); }\n"
    )
    new = (
        ".management-card { margin: 20px; }\n"
        '.studio-app .studio-topbar .global-search input[type="search"] { border: 0; }\n'
        ".preference-warning { color: var(--warning); }\n"
    )
    assert M["preferences_cleanup_only"](old, new)
    assert not M["preferences_cleanup_only"](old, new.replace("border: 0", "border: 10px"))
    assert not M["selected"](["frontend/src/theme.ts", M["PREFERENCES"]])


def test_navigation_file_allows_only_localized_theme_label_changes():
    old = 'def test_navigation():\n    check("Dark")\n    check("浅色")\n'
    new = old.replace('"Dark"', '"Night black"').replace('"浅色"', '"暖色"')
    assert M["navigation_theme_labels_only"](old, new)
    assert not M["navigation_theme_labels_only"](old, new.replace("check(", "ignore("))
    assert not M["navigation_theme_labels_only"](old, new + "\ndef test_other():\n    pass\n")
    assert not M["selected"](["frontend/src/theme.ts", M["NAVIGATION"]])


def test_reusable_appearance_flag_reaches_both_outer_interface_gates():
    prediction = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    published = prediction.split("permissions:", 1)[0].split("workflow_call:", 1)[1]
    assert "appearance_only:" in published
    assert "value: ${{ jobs.scope.outputs.appearance_only }}" in published
    for filename in ("user-interface-checks.yml", "task-layout-checks.yml"):
        text = Path(".github/workflows", filename).read_text()
        conditions = [line for line in text.splitlines() if line.lstrip().startswith("if:")]
        assert any(
            "needs.prediction-scope.outputs.appearance_only != 'true'" in line
            for line in conditions
        )
