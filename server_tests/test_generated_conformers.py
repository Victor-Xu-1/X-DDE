"""Real generated molecular records must keep graph/stereo identity and convergence."""

import importlib
import math
from pathlib import Path

import numpy as np
import pytest
from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
COUNTEREXAMPLE = "COc1cnc(Nc2ccc3cc(C(=O)N(C)C)[nH]c3c2F)nc1N1CCN(CCO)C(C)C1"


@pytest.fixture
def native(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(ROOT / "chemistry"))
    monkeypatch.syspath_prepend(str(ROOT / "integrations"))
    value = importlib.import_module("native_io")
    monkeypatch.setattr(
        value,
        "Path",
        lambda *parts: tmp_path.joinpath(*parts[1:]) if parts[0] == "/output" else Path(*parts),
    )
    return value


@pytest.mark.parametrize(
    "smiles",
    [
        COUNTEREXAMPLE,
        "COC(=O)[C@@H](N)[C@H](O)C1CC(O)C(F)C1",
        "NC(=O)c1ccc(NC(=O)C=Cc2ccccc2)cc1",
        "NC(=O)c1ccc(NC(=O)/C=C/c2ccccc2)cc1",
        "O=C(NCC[C@H]([13CH3])C(F)O)N1CCC(c2ccccc2)CC1",
    ],
)
def test_generated_sdf_readback_keeps_source_uncertainty_and_actual_minimization(
    native, tmp_path, smiles
):
    source = Chem.MolFromSmiles(smiles)
    expected = Chem.MolToSmiles(source, isomericSmiles=True)
    row = native.molecular_candidate(smiles, 1, 2029)
    molecule = Chem.SDMolSupplier(str(tmp_path / row["artifact"]), removeHs=False)[0]
    assert molecule is not None and molecule.GetConformer().Is3D()
    assert Chem.MolToSmiles(molecule, isomericSmiles=True) == row["smiles"] == expected
    assert np.isfinite(molecule.GetConformer().GetPositions()).all()
    assert molecule.GetIntProp("X-DDE optimization return code") == 0
    assert molecule.GetIntProp("X-DDE optimization iteration limit") == 1000
    assert molecule.GetProp("X-DDE force field") == "MMFF94s"
    assert molecule.GetIntProp("X-DDE conformer seed") == 2029
    energy = row["metrics"][-1]
    assert energy["meaning"] == "energy" and energy["unit"] == "kcal/mol"
    assert math.isclose(
        energy["value"], molecule.GetDoubleProp("X-DDE unbound conformer energy (kcal/mol)")
    )
    assert source.GetNumConformers() == 0
    assert row["geometry"] == "unbound_conformer"


@pytest.mark.parametrize(
    "failure,method,value",
    [
        ("embedding failed", "EmbedMolecule", -1),
        ("lacks MMFF94s parameters", "MMFFHasAllMoleculeParams", False),
        ("did not converge", "MMFFOptimizeMolecule", 1),
    ],
)
def test_unqualified_geometry_is_not_silently_published_as_a_3d_candidate(
    native, tmp_path, monkeypatch, failure, method, value
):
    monkeypatch.setattr(AllChem, method, lambda *args, **kwargs: value)
    with pytest.raises(ValueError, match=failure):
        native.molecular_candidate(COUNTEREXAMPLE, 1, 2029)
    assert not (tmp_path / "molecule-001.sdf").exists()


@pytest.mark.parametrize("smiles", ["not-a-molecule", "CC.Cl", "*c1ccccc1"])
def test_invalid_disconnected_or_attachment_query_is_not_published(native, tmp_path, smiles):
    with pytest.raises(ValueError, match="invalid or disconnected"):
        native.molecular_candidate(smiles, 1, 2029)
    assert not (tmp_path / "molecule-001.sdf").exists()


def test_nonfinite_force_field_energy_is_not_published(native, tmp_path, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        AllChem,
        "MMFFGetMoleculeForceField",
        lambda *args: SimpleNamespace(CalcEnergy=lambda: math.nan),
    )
    with pytest.raises(ValueError, match="nonfinite"):
        native.molecular_candidate(COUNTEREXAMPLE, 1, 2029)
    assert not (tmp_path / "molecule-001.sdf").exists()


def test_native_snapshot_stages_the_existing_stereo_authority(tmp_path):
    from opendde_workbench.integrations.backend import ScientificBackend
    from opendde_workbench.settings import Settings

    settings = Settings(
        **{
            key: tmp_path / key
            for key in ("state_dir", "image_file", "code_file", "model_dir", "cache_dir")
        }
    )
    backend = ScientificBackend(settings, "reinvent")
    assert backend.shared_sources["molfile_stereo.py"] == ROOT / "chemistry/molfile_stereo.py"
    assert backend.shared_sources["native_generated_molecule.py"].is_file()
