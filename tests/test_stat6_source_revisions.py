"""Corrected study sources preserve prior manifests, files and native case identities."""

import hashlib
import json

import pytest

from opendde_workbench.examples.catalogue_profiles import compatible_modules
from opendde_workbench.examples.stat6 import catalogue


def test_published_study_profiles_keep_their_exact_historical_sources():
    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_text())
    assert profiles
    for digest, profile in profiles.items():
        assert compatible_modules(digest, profile="stat6") == tuple(profile["module_ids"])
    assert catalogue.CASE.revision == 2
    frozen = catalogue.ROOT / "manifest-v1.json"
    assert json.loads(frozen.read_text())["case"]["revision"] == 1


def test_modified_historical_manifest_is_rejected_before_it_can_admit_a_bundle(
    tmp_path, monkeypatch
):
    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_text())
    digest, profile = next(
        (key, value) for key, value in profiles.items() if "manifest_file" in value
    )
    (tmp_path / "catalogue-profiles.json").write_text(json.dumps({digest: profile}))
    (tmp_path / profile["manifest_file"]).write_text("{}")
    monkeypatch.setattr(catalogue, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="Historical study manifest changed"):
        compatible_modules(digest, profile="stat6")


def test_corrected_protac_matches_supplied_identity_without_recomputing_or_moving_atoms():
    chem = pytest.importorskip("rdkit.Chem")
    numpy = pytest.importorskip("numpy")
    manifest = catalogue.MANIFEST
    proof = manifest["source_corrections"][0]
    old_path = catalogue.ROOT / "inputs" / proof["source_file"]
    new_path = catalogue.ROOT / "inputs" / proof["derived_file"]
    assert hashlib.sha256(old_path.read_bytes()).hexdigest() == proof["source_sha256"]
    assert hashlib.sha256(new_path.read_bytes()).hexdigest() == proof["derived_sha256"]
    old = chem.SDMolSupplier(str(old_path), removeHs=False)[0]
    new = chem.SDMolSupplier(str(new_path), removeHs=False)[0]
    assert old is not None and new is not None and new.GetConformer().Is3D()
    assert numpy.array_equal(old.GetConformer().GetPositions(), new.GetConformer().GetPositions())
    assert [
        (a.GetAtomicNum(), a.GetIsotope(), a.GetFormalCharge(), a.GetAtomMapNum())
        for a in old.GetAtoms()
    ] == [
        (a.GetAtomicNum(), a.GetIsotope(), a.GetFormalCharge(), a.GetAtomMapNum())
        for a in new.GetAtoms()
    ]
    for atom in new.GetAtoms():
        atom.SetAtomMapNum(0)
    expected = chem.MolFromSmiles(proof["source_original_smiles"])
    assert chem.MolToSmiles(chem.RemoveHs(new), isomericSmiles=True) == chem.MolToSmiles(
        expected, isomericSmiles=True
    )
    assert all(
        new.GetAtomWithIdx(i).GetChiralTag() == chem.ChiralType.CHI_UNSPECIFIED
        for i in proof["source_undefined_stereocenters"]
    )
    assert proof["new_geometry_or_energy_calculations"] == 0
