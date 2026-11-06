import runpy
from pathlib import Path

scope = runpy.run_path(str(Path(__file__).parents[1] / "scripts/material-input-scope.py"))


def test_material_change_is_closed_to_direct_files():
    assert scope["selected"]({"frontend/src/diffsbdd/ReferencePicker.tsx"})
    assert scope["selected"](scope["FILES"])
    assert not scope["selected"]({"pyproject.toml"})
    assert not scope["selected"](scope["FILES"] | {"src/opendde_workbench/api.py"})
    assert not scope["selected"](scope["FILES"] | {"frontend/src/diffsbdd/DiffForm.tsx"})
