"""A source/CDR-specific delegation never suppresses unrelated or unknown changes."""

import runpy

selected = runpy.run_path("scripts/antibody_template_scope.py")["selected"]
CORE = "src/opendde_workbench/examples/stat6/antibody_cdr_inputs.py"


def test_exact_cdr_batch_and_publication_companions_use_the_focused_gate():
    assert selected([CORE, "frontend/src/examples/harness.ts", "pyproject.toml"])


def test_unknown_shared_scientific_or_unrelated_changes_keep_original_gates():
    for path in (
        "src/opendde_workbench/examples/pins.py",
        "src/opendde_workbench/antibodies/result.py",
        "src/opendde_workbench/chemistry/states.py",
        "frontend/src/operations/HarnessForm.tsx",
        "src/opendde_workbench/examples/stat6/new_scientific_model.py",
    ):
        assert not selected([CORE, path])


def test_empty_and_companion_only_edits_do_not_delegate():
    assert not selected([])
    assert not selected(["src/opendde_workbench/examples/stat6/preparation.py"])
    assert not selected(["pyproject.toml", ".github/workflows/stat6-template-checks.yml"])
