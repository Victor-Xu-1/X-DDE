import runpy
from pathlib import Path

scope = runpy.run_path(str(Path(__file__).parents[1] / "scripts/material-input-scope.py"))
marker = '      - "!frontend/src/research/SequencePicker*"\n'
before = "name: layout\npaths:\n" + marker
after = before + "".join(f'      - "!{path}"\n' for path in scope["DELEGATED"])


def test_material_change_is_closed_to_direct_files():
    assert scope["selected"]({"frontend/src/diffsbdd/ReferencePicker.tsx"})
    assert scope["selected"](scope["FILES"], layout_before=before, layout_after=after)
    assert not scope["selected"]({"pyproject.toml"})
    assert not scope["selected"](scope["FILES"] | {"src/opendde_workbench/api.py"})
    assert not scope["selected"](scope["FILES"] | {"frontend/src/diffsbdd/DiffForm.tsx"})


def test_explicit_dispatch_is_never_replaced_by_automatic_material_gate():
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")
    assert not scope["selected"](scope["FILES"], "schedule")


def test_browser_fixture_does_not_match_the_broad_layout_pattern():
    import fnmatch

    for browser in (
        "server_tests/test_material_sources_browser.py",
        "server_tests/test_sequence_material_browser.py",
    ):
        assert browser in scope["SOURCES"]
        assert not fnmatch.fnmatch(browser, "server_tests/*layout*")


def test_layout_routing_accepts_only_the_exact_new_material_exclusions():
    assert scope["delegated_layout"](before, after)
    assert not scope["delegated_layout"]("", after)
    assert not scope["delegated_layout"](before + marker, after)
    for unexpected in (
        after + '      - "!frontend/src/**"\n',
        after.replace("name: layout", "name: skipped"),
        after.replace("SequenceTextInput*", "*"),
        after.replace("MaterialInput*", "MaterialInput.tsx"),
        before,
    ):
        assert not scope["delegated_layout"](before, unexpected)
        assert not scope["selected"](scope["FILES"], layout_before=before, layout_after=unexpected)
    assert not scope["selected"](scope["FILES"])
    assert not scope["selected"]({scope["LAYOUT"]}, layout_before=before, layout_after=after)


def test_new_shared_sources_have_one_focused_workflow_owner():
    root = Path(__file__).parents[1]
    inputs = (root / ".github/workflows/reference-input-checks.yml").read_text()
    layout = (root / scope["LAYOUT"]).read_text()
    for path in scope["DELEGATED"]:
        assert f'      - "{path}"' in inputs
        assert f'      - "!{path}"' in layout
