"""Focused active-study templates and archival isolation; no scientific jobs or network."""

import hashlib

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.catalogue import MODULES as ARCHIVE_MODULES
from opendde_workbench.examples.stat6 import catalogue
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def scientific_store(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    return store, ScientificStore(store, AssetStore(store, tmp_path / "assets"))


def test_every_affected_template_has_stat6_identity_and_a_distinct_revision():
    assert set(catalogue.MODULES) == set(ARCHIVE_MODULES)
    for key, module in catalogue.MODULES.items():
        assert module.case_id == "stat6-defined-molecules"
        assert module.revision == ARCHIVE_MODULES[key].revision + 2
        assert catalogue.study_context(key)["target"] == "STAT6"
    assert ARCHIVE_MODULES["p2rank.detect"].case_id == "brd4-jq1"


def test_actual_bundled_inputs_keep_confirmed_smiles_and_computed_geometry():
    values = catalogue.MANIFEST["molecules"]
    assert len(values) == 2
    assert values[0]["original_smiles"].startswith("O=C(CCN1C=CN=N1)")
    assert values[0]["heavy_atoms"] == 30
    assert values[1]["heavy_atoms"] == 62
    assert values[1]["undefined_stereocenters"] == [53]
    assert all(row["minimization_converged"] and not row["binding_pose"] for row in values)
    assert all(row["nonplanarity_singular_value"] > 0.05 for row in values)
    for key, spec in catalogue.FILES.items():
        data = catalogue.verified_input(key)
        assert hashlib.sha256(data).hexdigest() == spec.sha256
    assert "AK-1690" in catalogue.CASE.evidence_entities["structure"]["description"]
    assert catalogue.FILES["bound_reference"].sha256 not in {row["sha256"] for row in values}


def test_repeat_preparation_reuses_exact_study_versions_without_changing_originals(tmp_path):
    store, scientific = scientific_store(tmp_path)
    old = scientific.assets.save("original.pdb", "structure", b"HEADER original\nEND\n")
    first = prepare_stat6("predict", scientific)
    repeated = prepare_stat6("deepternary.model", scientific)
    assert first.objects["study_ligand"].reference == repeated.objects["study_ligand"].reference
    assert first.objects["study_protac"].id == repeated.objects["study_protac"].id
    assert scientific.assets.path(old).read_bytes() == b"HEADER original\nEND\n"
    assert len(first.sequences["protein"]) == 847
    assert first.request["components"][1]["ligand_file"] == str(
        first.objects["ligand"].reference.asset_id
    )
    assert first.objects["ligand"].reference != first.objects["study_protac"].reference
    assert store.list_jobs() == []


@pytest.mark.parametrize("key", ["openmm.dynamics", "gromacs.dynamics", "openfe.rbfe"])
def test_unbound_conformer_does_not_prefill_a_binding_pose_field(tmp_path, key):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6(key, scientific)
    assert "study_ligand" in prepared.objects and "ligand" not in prepared.objects
    assert prepared.study["required_materials"]
    assert store.list_jobs() == []


def test_property_training_requires_real_measurements_not_the_study_conformer(tmp_path):
    _, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6("chemprop.train", scientific)
    assert prepared.objects["library"].reference != prepared.objects["study_ligand"].reference
    assert prepared.request["payload"]["activity_property"] == "pIC50"
    assert prepared.study["supporting_sources"]["stat6_assay"]["measurements"] == 38


@pytest.mark.parametrize("capability", ["gnina.score", "gnina.minimize", "posebusters.check"])
def test_pose_tasks_use_the_native_paired_frame_and_keep_the_unbound_input(tmp_path, capability):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6(capability, scientific)
    assert prepared.objects["ligand"].reference == prepared.objects["calculated_pose"].reference
    assert (
        prepared.objects["receptor"].reference == prepared.objects["calculated_receptor"].reference
    )
    assert prepared.objects["ligand"].reference != prepared.objects["study_ligand"].reference
    assert store.list_jobs() == []


def test_related_antibody_is_explicit_and_observed_indices_are_not_canonical(tmp_path):
    store, scientific = scientific_store(tmp_path)
    antibody = prepare_stat6("antibody.number", scientific)
    assert len(antibody.sequences["heavy"]) == 125
    assert len(antibody.sequences["light"]) == 112
    assert len(antibody.sequences["antigen"]) == 218
    assert antibody.study["task_target"] == "IL-4R alpha · STAT6 pathway"
    protein = prepare_stat6("mpnn", scientific)
    assert len(protein.sequences["observed_protein"]) == 409
    assert protein.sequences["observed_protein"][397] == "N"
    assert len(protein.sequences["protein"]) == 847
    assert protein.sequences["protein"][613] == "N"
    assert store.list_jobs() == []


@pytest.mark.parametrize("key", ["del.analyze", "openfe.rbfe", "deepternary.model"])
def test_missing_experimental_inputs_are_explicit_and_no_prior_result_is_substituted(tmp_path, key):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6(key, scientific)
    assert prepared.study["required_materials"]
    assert prepared.record is None and prepared.source_record is None
    assert prepared.data_assets["stat6_measurements"].kind == "measurements"
    assert prepared.request is None
    assert not ({"jq1", "mz1", "heavy", "light", "tyk2_ligands"} & set(prepared.objects))
    assert store.list_jobs() == []


def test_changed_study_bytes_are_rejected_instead_of_fetching_a_replacement(tmp_path, monkeypatch):
    fake = tmp_path / "inputs"
    fake.mkdir()
    spec = catalogue.FILES["study_ligand"]
    (fake / spec.name).write_bytes(b"x" * spec.bytes)
    monkeypatch.setattr(catalogue, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="checksum changed"):
        catalogue.verified_input("study_ligand")
