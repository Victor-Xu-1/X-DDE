"""The preview-to-execution boundary retains one native pocket definition."""

import importlib.util
import sys
from contextlib import contextmanager
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


@pytest.mark.parametrize("reference", ["aligned-reference.sdf", None])
def test_generation_preserves_the_native_exclusive_pocket_contract(
    tmp_path, monkeypatch, reference
):
    output = tmp_path / "output"
    destination = output / "native" / "result"
    chemistry = ModuleType("chemistry")
    for name in (
        "edit",
        "inspect_identity",
        "inspect_pocket",
        "interactions",
        "molecular_collection",
        "prepare",
    ):
        setattr(chemistry, name, lambda *args: None)
    options = SimpleNamespace(count=3, atoms=31, seed=2026, objective="qed")
    chemistry.generation_input = lambda *args: SimpleNamespace(options=options)
    monkeypatch.setitem(sys.modules, "chemistry", chemistry)
    generation = ModuleType("local_diffsbdd.generation")
    generation.Request = SimpleNamespace

    def run(request):
        # This is the genuine native input invariant, not a simulated model result.
        assert bool(request.reference) != bool(request.residues)
        assert request.reference == reference
        assert request.protein == tmp_path / "canonical.pdb"
        assert set(request.residues) <= {"A:81", "A:82"}
        return destination, {"status": "completed", "valid": 0, "attempted": 3, "notes": []}

    generation.run = run
    pockets = ModuleType("local_diffsbdd.pockets")

    @contextmanager
    def prepare_input(*args):
        yield SimpleNamespace(
            protein=tmp_path / "canonical.pdb",
            reference=reference,
            residues=["A:81", "A:82"],
            initial=None,
        )

    pockets.prepare_input = prepare_input
    monkeypatch.setitem(sys.modules, "local_diffsbdd", ModuleType("local_diffsbdd"))
    monkeypatch.setitem(sys.modules, "local_diffsbdd.generation", generation)
    monkeypatch.setitem(sys.modules, "local_diffsbdd.pockets", pockets)
    path = Path(__file__).parents[1] / "src/opendde_workbench/diffsbdd/runner.py"
    spec = importlib.util.spec_from_file_location("isolated_diffsbdd_runner", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = module.generate({"mode": "generate"}, {}, tmp_path, output)
    assert result["molecule_artifact"] == "native/result/molecules.sdf"
