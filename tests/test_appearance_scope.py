"""Palette delegation must not hide unrelated layout or scientific changes."""

import runpy

import pytest

M = runpy.run_path("scripts/appearance-scope.py")


def test_palette_and_publication_only():
    assert M["selected"](M["FILES"] - {M["WORKSPACES"]})
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
