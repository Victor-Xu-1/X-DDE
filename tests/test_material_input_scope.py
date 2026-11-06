import runpy
from pathlib import Path

scope = runpy.run_path(str(Path(__file__).parents[1] / "scripts/material-input-scope.py"))


def test_material_change_is_closed_to_direct_files():
    assert scope["selected"]({"frontend/src/diffsbdd/ReferencePicker.tsx"})
    assert scope["selected"](scope["FILES"])
    assert not scope["selected"]({"pyproject.toml"})
    assert not scope["selected"](scope["FILES"] | {"src/opendde_workbench/api.py"})
    assert not scope["selected"](scope["FILES"] | {"frontend/src/diffsbdd/DiffForm.tsx"})


def test_explicit_dispatch_is_never_replaced_by_automatic_material_gate():
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")
    assert not scope["selected"](scope["FILES"], "schedule")


def test_browser_fixture_does_not_match_the_broad_layout_pattern():
    import fnmatch

    browser = "server_tests/test_material_sources_browser.py"
    assert browser in scope["SOURCES"]
    assert not fnmatch.fnmatch(browser, "server_tests/*layout*")
