"""Real store and native-output integrity fixtures; no scientific inference."""

import hashlib
import json
from uuid import uuid4

import pytest
from test_stat6_prepared_handoff import docking_fixture

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.receptor_provenance import prepared_receptor_origin
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.contracts import VersionInput


def receptor_copy(store, scientific, settings, previous, *, invalid=None):
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).get("gnina.dock")
    body = store.get(str(pin.job_id)).request.model_dump(mode="json")
    body["receptor"] = previous.reference.model_dump(mode="json")
    body["search"]["frame"] = body["receptor"]
    job = store.create(TASK_ADAPTER.validate_python(body), str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    raw = scientific.assets.path(scientific.assets.get(previous.reference.asset_id)).read_bytes()
    if invalid != "missing_output":
        (output / "receptor.pdb").write_bytes(raw)
    (output / "result.json").write_text(json.dumps({"transport_fixture_not_inference": True}))
    store.bind_environment(job.id, capture(settings, "gnina"))
    store.finish(job.id, Status.SUCCEEDED)
    asset = scientific.assets.save(
        "receptor-copy.pdb", "structure", raw + b"changed" if invalid == "changed_bytes" else raw
    )
    version = scientific.create(
        VersionInput(
            asset_id=asset.id,
            kind="structure",
            label="Native-copy protocol fixture",
            parent_id=previous.parent_id if invalid == "wrong_parent" else previous.id,
            relation="derived_from",
        ),
        uuid4(),
        source_job=job.id,
    )
    return version


def test_multiple_docking_copies_resolve_to_the_unchanged_canonical_preparation(settings):
    store, scientific, _, native = docking_fixture(settings)
    first = receptor_copy(store, scientific, settings, native)
    second = receptor_copy(store, scientific, settings, first)
    before = {
        key: scientific.get(key).model_dump_json() for key in (native.id, first.id, second.id)
    }
    resolved, source = prepared_receptor_origin(scientific, settings.state_dir, second)
    assert resolved == native and source.id == str(native.source_job)
    assert {key: scientific.get(key).model_dump_json() for key in before} == before


@pytest.mark.parametrize("invalid", ["changed_bytes", "wrong_parent", "missing_output"])
def test_unproved_or_modified_copies_do_not_replace_the_reviewed_preparation(settings, invalid):
    store, scientific, _, native = docking_fixture(settings)
    copied = receptor_copy(store, scientific, settings, native, invalid=invalid)
    with pytest.raises(ValueError, match="receptor copy"):
        prepared_receptor_origin(scientific, settings.state_dir, copied)


def test_identical_user_file_is_not_native_preparation_provenance(settings):
    _, scientific, _, native = docking_fixture(settings)
    unrelated = scientific.create(
        VersionInput(asset_id=native.reference.asset_id, kind="structure", label="Unproved copy"),
        uuid4(),
    )
    with pytest.raises(ValueError, match="no successful native"):
        prepared_receptor_origin(scientific, settings.state_dir, unrelated)


def ensemble_reference_copy(store, scientific, settings, native, *, mutation=None):
    """Synthetic transport evidence only: no scientific alignment was run."""
    raw = scientific.assets.path(scientific.assets.get(native.reference.asset_id)).read_bytes()
    other_asset = scientific.assets.save("other.pdb", "structure", b"Different fixture\n")
    other = scientific.create(
        VersionInput(asset_id=other_asset.id, kind="structure", label="Other input"), uuid4()
    )
    request = TASK_ADAPTER.validate_python({
        "operation": "receptor_ensemble", "name": "Reference transport fixture",
        "inputs": [{"structure": native.reference.model_dump(mode="json")},
                   {"structure": other.reference.model_dump(mode="json")}],
        "options": {"minimum_pairs": 3},
    })
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    files = [raw, b"Other aligned fixture\n"]
    pairs = [{"reference": {"chain": "A", "number": n},
              "moving": {"chain": "A", "number": n}} for n in (1, 2, 3)]
    quality = {"source_format": "pdb", "source_model_count": 1, "selected_model_index": 0,
        "selected_chains": ["A"], "parser_warnings": [], "parser_warnings_truncated": False,
        "atom_count": 3, "observed_residue_count": 3,
        "protein_chains": [{"chain": "A", "observed_ca_count": 3, "sequence": "AAA"}],
        "incomplete_backbone": [], "backbone_complete": True, "sidechain_completeness": "not_checked",
        "unobserved_residues": "not_inferred", "bfactor_mean": None,
        "bfactor_interpretation": "raw_bfactor_not_automatic_plddt", "occupancy_minimum": None,
        "biological_assembly": "provided_coordinates_only", "source_profile": "unspecified"}
    members = []
    for index, content in enumerate(files):
        name = f"aligned-{index:03d}.pdb"
        (output / name).write_bytes(content)
        members.append({"index": index, "source": request.inputs[index].model_dump(mode="json"),
            "status": "reference" if index == 0 else "aligned", "artifact": name,
            "artifact_sha256": hashlib.sha256(content).hexdigest(),
            "correspondence": {"method": "reference_coordinates" if index == 0 else
                               "unique_observed_ca_sequence_alignment", "pair_count": 3,
                               "identity": 1, "coverage": 1},
            "transformation": {"rotation": [[1,0,0],[0,1,0],[0,0,1]],
                "translation": [0,0,0], "convention": "row_xyz_times_rotation_plus_translation",
                "rmsd_angstrom": 0, "residue_pairs": pairs}, "quality": quality})
    report = {"operation": "receptor_ensemble", "complete": True, "schema_version": 1,
        "inputs": [x.model_dump(mode="json") for x in request.inputs],
        "options": request.options.model_dump(mode="json"), "members": members,
        "qualified_count": 2, "collection_status": "aligned",
        "coordinate_frame": "selected_reference_structure", "coordinate_unit": "angstrom",
        "export_rounding_tolerance_angstrom": 0.001, "versions": {"biopython": "1.88", "numpy": "1.26.4"},
        "method_scope": "observed_ca_rigid_superposition_not_conformation_sampling",
        "biological_assembly": "provided_coordinates_only", "chemical_validation": "not_full_atom_parameterization"}
    (output / "result.json").write_text(json.dumps(report))
    store.bind_environment(job.id, capture(settings, "biopython"))
    store.finish(job.id, Status.SUCCEEDED)
    asset = scientific.assets.save("ensemble-copy.pdb", "structure", raw)
    copy = scientific.create(VersionInput(asset_id=asset.id, kind="structure", label="Reference copy",
        parent_id=other.id if mutation == "wrong_parent" else native.id,
        relation="prepared_from"), uuid4(), source_job=job.id)
    if mutation == "changed_output":
        (output / "aligned-000.pdb").write_bytes(b"changed")
    return copy


def test_verified_byte_identical_ensemble_reference_resolves_to_preparation(settings):
    store, scientific, _, native = docking_fixture(settings)
    copy = ensemble_reference_copy(store, scientific, settings, native)
    resolved, source = prepared_receptor_origin(scientific, settings.state_dir, copy)
    assert resolved == native and source.id == str(native.source_job)


@pytest.mark.parametrize("mutation", ["wrong_parent", "changed_output"])
def test_unproved_ensemble_reference_is_rejected(settings, mutation):
    store, scientific, _, native = docking_fixture(settings)
    copy = ensemble_reference_copy(store, scientific, settings, native, mutation=mutation)
    with pytest.raises(ValueError):
        prepared_receptor_origin(scientific, settings.state_dir, copy)
