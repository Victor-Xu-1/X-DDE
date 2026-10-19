"""Real retained STAT6 wrong-site growth and exact native-adapter boundary checks."""

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest
from rdkit import Chem

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/stat6/inpaint_attachment"


@pytest.fixture
def native(tmp_path, monkeypatch):
    def load(name, path):
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        return module

    source = ROOT / "src/opendde_workbench/diffsbdd"
    snapshot = load("isolated_attachment_snapshot", source / "snapshot.py")
    entry, digests = snapshot.capture(tmp_path)
    monkeypatch.syspath_prepend(str(entry.parent))
    assert (entry.parent / "core_boundary.py").read_bytes() == (
        source / "core_boundary.py"
    ).read_bytes()
    assert (
        digests["core_boundary.py"]
        == hashlib.sha256((source / "core_boundary.py").read_bytes()).hexdigest()
    )
    for name in ("stereo", "core_boundary", "fixed_core", "molfile_stereo", "chemistry"):
        module = load(name, entry.parent / (name + ".py"))
    return sys.modules["fixed_core"], sys.modules["core_boundary"], module


def molecules():
    provenance = json.loads((FIXTURE / "provenance.json").read_bytes())
    parsed = []
    for name in ("source.sdf", "unexpected-methyl-growth.sdf"):
        raw = (FIXTURE / name).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == provenance["files"][name]["sha256"]
        mol = Chem.SDMolSupplier(str(FIXTURE / name), removeHs=True)[0]
        assert mol is not None and mol.GetConformer().Is3D()
        parsed.append(mol)
    return *parsed, provenance["fixed_atoms"]


def test_actual_stat6_protected_methyl_growth_fails_the_new_scope_without_changing_files(native):
    verifier, boundary, _ = native
    source, candidate, fixed = molecules()
    before = Chem.MolToMolBlock(candidate)
    legacy = verifier.assess(source, candidate, fixed)
    assert legacy["status"] == "passed"
    mapping = {row["source_atom"]: row["output_atom"] for row in legacy["mapping"]}
    measured = boundary.assess_attachments(source, candidate, mapping)
    assert any(row["source_atom"] == 28 for row in measured["unexpected_attachments"])
    strict = verifier.assess(source, candidate, fixed, attachment_policy="original_cuts")
    assert strict["method"] == "rdkit_fixed_core_attachments_v2"
    assert strict["status"] == "failed" and strict["reason"] == "unexpected_core_attachment"
    assert not strict["mapping"]
    assert Chem.MolToMolBlock(candidate) == before


def test_original_pose_is_a_valid_boundary_control_even_after_output_atom_reordering(native):
    verifier, _, _ = native
    source, _, fixed = molecules()
    candidate = Chem.RenumberAtoms(source, list(reversed(range(source.GetNumAtoms()))))
    result = verifier.assess(source, candidate, fixed, attachment_policy="original_cuts")
    assert result["status"] == "passed" and result["maximum_displacement"] == 0
    assert len(result["mapping"]) == len(fixed)


def test_disconnected_growth_is_not_qualified_as_a_connected_replacement(native):
    verifier, _, _ = native
    source, _, fixed = molecules()
    chloride = Chem.MolFromSmiles("[Cl-]")
    conformer = Chem.Conformer(1)
    conformer.Set3D(True)
    conformer.SetAtomPosition(0, (100, 100, 100))
    chloride.AddConformer(conformer)
    candidate = Chem.CombineMols(source, chloride)
    result = verifier.assess(source, candidate, fixed, attachment_policy="original_cuts")
    assert result["status"] == "failed" and result["reason"] == "disconnected_candidate"


def test_platform_attachment_policy_never_leaks_into_the_native_sampler_contract(
    native, tmp_path, monkeypatch
):
    _, _, chemistry = native
    directory = tmp_path / "job"
    (directory / "assets").mkdir(parents=True)
    raw = (FIXTURE / "source.sdf").read_bytes()
    (directory / "assets/source.sdf").write_bytes(raw)
    (directory / "assets/receptor.pdb").write_text("HEADER    Protocol boundary fixture\n")
    ligand = {"asset_id": "ligand", "sha256": hashlib.sha256(raw).hexdigest()}
    protein = {
        "asset_id": "protein",
        "sha256": hashlib.sha256((directory / "assets/receptor.pdb").read_bytes()).hexdigest(),
    }
    bindings = {"ligand": "/job/assets/source.sdf", "protein": "/job/assets/receptor.pdb"}
    contracts = ModuleType("local_diffsbdd.contracts")
    contracts.GenerationInput = lambda **kwargs: kwargs
    monkeypatch.setitem(sys.modules, "local_diffsbdd", ModuleType("local_diffsbdd"))
    monkeypatch.setitem(sys.modules, "local_diffsbdd.contracts", contracts)
    _, _, fixed = molecules()
    result = chemistry.generation_input(
        {
            "mode": "inpaint",
            "protein": protein,
            "initial": ligand,
            "pocket": {"kind": "ligand", "ligand": ligand},
            "options": {
                "attachment_policy": "original_cuts",
                "fixed_atoms": fixed,
                "added_atoms": 15,
            },
        },
        bindings,
        directory,
    )
    assert "attachment_policy" not in result["options"]
    assert result["options"]["fixed_atoms"] == fixed
