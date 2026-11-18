"""Only the reviewed preparation delta may bypass unrelated result consumers."""

import runpy
from types import SimpleNamespace

import pytest

SCOPE = runpy.run_path("scripts/receptor-workspace-scope.py")
BASE = "f" * 40
PREP = "frontend/src/receptors/PreparedStructureWorkspace.tsx"
ROUTE = "frontend/src/operations/OperationResults.tsx"
OTHER = "frontend/src/structure-comparison/ComparisonForm.tsx"


@pytest.mark.parametrize("paths,match,exclusive", [
    ([PREP], True, True),
    ([PREP, ROUTE], True, True),
    ([PREP, ROUTE], False, False),
    ([PREP, ROUTE, OTHER], True, False),
])
def test_preparation_route_keeps_its_suite_without_hiding_other_consumers(
    monkeypatch, paths, match, exclusive,
):
    scope = SCOPE["receptor_workspaces"]
    before, after = SCOPE["REVIEWED_ROUTES"][ROUTE]
    digests = {BASE: before, "HEAD": after if match else "0" * 40}
    monkeypatch.setenv("GITHUB_REF_NAME", "main")
    monkeypatch.setattr("subprocess.run", lambda *_args, **_kw: SimpleNamespace(returncode=0))
    monkeypatch.setattr("subprocess.check_output", lambda *_args, **_kw: "\n".join(paths))
    monkeypatch.setitem(scope.__globals__, "run_path", lambda _path: {
        "VERSION_FILES": set(),
        "git_blob": lambda revision, _file: digests[revision],
    })
    assert scope(BASE, "push") == (exclusive, ("preparation",))
