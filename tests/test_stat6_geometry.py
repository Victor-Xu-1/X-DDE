"""Reviewed computed input identity qualifies previews; a copied property cannot."""

from test_stat6_templates import scientific_store

from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.research.initial_pose import InitialPosePreparation
from opendde_workbench.research.pose_contract import AssetPoseSource, InitialPoseInput


def test_packaged_minimized_inputs_preview_without_recalculating_or_relabeling(tmp_path, settings):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6("deepternary.model", scientific)
    initial = InitialPosePreparation(store, scientific.assets, settings)
    for key in ("study_ligand", "study_protac"):
        source = prepared.objects[key].reference
        request, version = initial.resolve(
            InitialPoseInput(
                source=AssetPoseSource(kind="asset", asset_id=source.asset_id, record=0)
            )
        )
        assert request is None and version.reference.asset_id == source.asset_id
        assert version.source_job is None
    assert store.list_jobs() == []


def test_unreviewed_3d_input_with_copied_minimization_properties_still_needs_computation(
    tmp_path, settings
):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6("predict", scientific)
    source = scientific.assets.get(prepared.objects["study_ligand"].reference.asset_id)
    raw = (
        scientific.assets.path(source)
        .read_bytes()
        .replace(b"STAT6-user-warhead", b"Unreviewed-input", 1)
    )
    changed = scientific.assets.save("unreviewed.sdf", "ligand", raw)
    request, version = InitialPosePreparation(store, scientific.assets, settings).resolve(
        InitialPoseInput(source=AssetPoseSource(kind="asset", asset_id=changed.id, record=0))
    )
    assert version is None and request.operation == "molecule_minimize"
    assert str(request.molecule.asset_id) == changed.id
    assert store.list_jobs() == []
