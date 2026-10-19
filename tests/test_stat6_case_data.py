"""Install the exact published STAT6 native data through the real component queue."""

import hashlib
import json
import os
import shutil
import zipfile
from dataclasses import replace
from pathlib import Path

import pytest
from stat6_diversification_case import retained_diversification
from stat6_interface_case import retained_interface
from stat6_optimization_case import retained_optimization

from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.examples import stat6_bundle_release as spec
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.research.state_sets import StateSets
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_REVIEWED_STAT6_ARCHIVE"), reason="Select the actual published-data gate."
)


def retained_state_roundtrip(settings, store, assets, tmp_path):
    job = store.get("444d5076-82f9-44fc-8743-43ad4def6af8")
    assert job and job.status == "succeeded" and job.request.operation == "molecular_states"
    indexed = OutputCatalog(store, assets).index(
        job, settings.state_dir / "jobs" / job.id / "output"
    )
    assert indexed["state"] == "complete", indexed
    states = StateSets(store, assets).list(source_job=job.id)
    assert len(states) == 1 and states[0].members[0].conformers
    state = states[0]
    target = tmp_path / "native-state-case.zip"
    exported = export_bundle(
        settings, target, spec.SOURCE_REVISION, capabilities=["chemistry.states"], profile="stat6"
    )
    destination = replace(settings, state_dir=tmp_path / "state-replay")
    assert restore_bundle(target, destination, exported["sha256"])["computed"] == 1
    replayed = Store(destination.state_dir / "jobs.sqlite3")
    replayed_assets = AssetStore(replayed, destination.state_dir / "assets")
    exact = StateSets(replayed, replayed_assets).get(state.id)
    assert exact.model_dump_json() == state.model_dump_json()
    scientific = ScientificStore(replayed, replayed_assets)
    for member in exact.members:
        scientific.validate_reference(member.reference)
        for conformer in member.conformers:
            scientific.validate_reference(conformer.reference)
    assert restore_bundle(target, destination, exported["sha256"])["computed"] == 1
    return str(state.id)


def retained_model_and_regions(settings, store, assets, tmp_path):
    pins = ExamplePins(store, settings.state_dir, modules=MODULES)
    model = pins.get("chemprop.train", verify=True)
    assert str(model.job_id) == "d90b04d5-f76d-44db-8762-78ff550dc1ec"
    assert model.review and model.review.scope == "reviewed_computational_example"
    assert "Predictive utility is NOT established" in model.review.limitations
    output = settings.state_dir / "jobs" / str(model.job_id) / "output"
    checkpoint_sha = "7424bd97c84d53c4a2318219d608fa6d489e92d1bcc98e62432eae530b3722fc"
    assert hashlib.sha256((output / "property-model.pt").read_bytes()).hexdigest() == checkpoint_sha
    result = json.loads((output / "result.json").read_bytes())
    assert len(result["validation_points"]) == 16
    assert next(row["value"] for row in result["metrics"] if row["name"] == "Test R²") < 0
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    regions = records.get("regions", verify=True)
    assert str(regions.record_id) == "29b2cbf6-381f-58b4-83b2-96f26911c649"
    from opendde_workbench.research.regions import RegionRecords

    document = RegionRecords(store, assets, settings).get(regions.record_id)
    assert document["body"]["identity_job"] == "8e66e83e-cce1-40ca-b343-ac33a12a495d"
    assert document["body"]["subject"]["sha256"] == (
        "034e6209f81b3c85d62a96a62fa4643dcf9f188ab64df5beb8c482bb18a738b0"
    )
    assert [len(row["atom_indices"]) for row in document["body"]["regions"]] == [38, 6, 18]
    identity = (
        settings.state_dir / "jobs" / document["body"]["identity_job"] / "output/selection.sdf"
    )
    assert hashlib.sha256(identity.read_bytes()).hexdigest() == (
        "1a60971c824f4f80d7a378356f2217394f51f3732b605f43440b22dc8d8fe283"
    )
    target = tmp_path / "model-and-regions.zip"
    exported = export_bundle(
        settings,
        target,
        spec.SOURCE_REVISION,
        capabilities=["chemprop.train", "regions"],
        profile="stat6",
    )
    replay = replace(settings, state_dir=tmp_path / "model-region-replay")
    assert restore_bundle(target, replay, exported["sha256"])["computed"] == 2
    replayed = Store(replay.state_dir / "jobs.sqlite3")
    replay_assets = AssetStore(replayed, replay.state_dir / "assets")
    assert (
        ExamplePins(replayed, replay.state_dir, modules=MODULES).get("chemprop.train", verify=True)
        == model
    )
    assert (
        ExampleRecords(replayed, replay_assets, replay, modules=MODULES).get("regions", verify=True)
        == regions
    )
    retained = replay.state_dir / "jobs" / str(model.job_id) / "output/property-model.pt"
    assert hashlib.sha256(retained.read_bytes()).hexdigest() == checkpoint_sha
    return {"model": str(model.job_id), "regions": str(regions.record_id)}


def test_real_current_data_queue_replay_original_inputs_and_native_plip(
    settings, tmp_path, monkeypatch
):
    archive = Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    assert archive.stat().st_size == spec.BYTES
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == spec.SHA256
    with zipfile.ZipFile(archive) as source:
        expected_jobs = {
            row["id"] for row in json.loads(source.read("manifest.json"))["records"]["jobs"]
        }
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    original = assets.save(
        "preserved-user-input.pdb", "structure", b"HEADER retained attachment\nEND\n"
    )
    original_bytes = assets.path(original).read_bytes()
    manager = DeploymentManager(settings.state_dir)
    manager.configure(str(tmp_path / "components"), False)
    root = Path(manager.store.config()["root"])
    cached = root / "downloads" / spec.URL.rsplit("/", 1)[1]
    cached.parent.mkdir(parents=True)
    shutil.copyfile(archive, cached)

    def no_network(*args, **kwargs):
        pytest.fail("A checksum-verified cached case archive must not be downloaded again.")

    monkeypatch.setattr("urllib.request.urlopen", no_network)
    operations = manager.enqueue("public-stat6-examples", "install")
    assert len(operations) == 1
    manager.tick()
    operation = manager.store.get(operations[0])
    assert operation["state"] == "succeeded", operation
    installed = manager.store.installed()["public-stat6-examples"]
    assert installed["version"] == spec.VERSION and installed["bundle_sha256"] == spec.SHA256
    assert installed["computed"] == len(spec.CAPABILITIES)
    expected = {
        "modules": len(spec.CAPABILITIES),
        "computed": len(spec.CAPABILITIES),
        "validated": 0,
    }
    assert restore_bundle(archive, settings, spec.SHA256) == expected
    assert verify_examples(settings, spec.CAPABILITIES, profile="stat6") == expected
    assert assets.path(original).read_bytes() == original_bytes
    # Read one beyond the sealed inventory to detect extra work, including beyond a default page.
    jobs = store.list_jobs(limit=len(expected_jobs) + 1)
    assert {row.id for row in jobs} == expected_jobs
    assert not any(row.status in {"queued", "running", "cancelling"} for row in jobs)
    sequence_pin = ExamplePins(store, settings.state_dir, modules=MODULES).get(
        "ligandmpnn.design", verify=True
    )
    assert str(sequence_pin.job_id) == "66aecb45-f475-419b-9e40-4bc6dfb7d472"
    assert sequence_pin.review and "three distinct sequences" in sequence_pin.review.interpretation
    sequence_output = settings.state_dir / "jobs" / str(sequence_pin.job_id) / "output"
    sequence_result = json.loads((sequence_output / "result.json").read_bytes())
    sequence_review = sequence_result["sequence_design"]
    assert (sequence_review["sample_count"], sequence_review["unique_sequence_count"]) == (8, 3)
    assert sequence_review["native_ligand_scored_residues"] == 3
    assert {row["identity"] for row in sequence_review["selected_residues"]} == {
        "A566",
        "A588",
        "A590",
    }
    assert hashlib.sha256((sequence_output / "packed-006.cif").read_bytes()).hexdigest() == (
        "6fe963480a5096c87f7dabec541973cee83fa03f97f8207e01bac197d64b344a"
    )
    generated = ExamplePins(store, settings.state_dir, modules=MODULES).get(
        "diffsbdd.generate", verify=True
    )
    assert str(generated.job_id) == "be6389cf-e6ce-4d2e-ae5a-9786d62dfe8a"
    assert generated.review and len(generated.supporting_evidence) == 5
    assert str(generated.supporting_evidence[-1].job_id) == ("b5b7a896-929b-45ad-88b9-e147c5b7540f")
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).get("plip.profile", verify=True)
    assert pin and str(pin.job_id) == "b8d92dc4-3dd3-418a-9ceb-2eaa6723d624"
    assert pin.revision == 3 and pin.review and pin.review.scope == "reviewed_computational_example"
    output = settings.state_dir / "jobs" / str(pin.job_id) / "output"
    result = json.loads((output / "result.json").read_bytes())
    assert result["program"] == "plip" and len(result["interactions"]) == 11
    assert (
        hashlib.sha256((output / "interaction-structure.cif").read_bytes()).hexdigest()
        == "6a116614692defb2b092e18e61d20c7256de59943c26188b702b167bf4e2c544"
    )
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    reported = records.get("experimental.evidence", verify=True)
    assert str(reported.record_id) == "3d3140eb-4576-5e95-b503-e64794657cea"
    assert not reported.evidence and not reported.supporting_evidence
    assert (
        reported.review
        and "not model inference or a new experiment" in reported.review.interpretation
    )
    from opendde_workbench.research.evidence_records import EvidenceRecords

    document = EvidenceRecords(store, assets).get(reported.record_id)
    assert len(document.observations) == len(document.request.compound_links) == 38
    assert (
        document.source_sha256 == "92568eae46bd175c537e446427c9784a6743cfbb3761986da532385cf43c3ad3"
    )
    assert document.request.conditions.species == ""
    assert (
        document.request.conditions.temperature_c is None and document.request.conditions.ph is None
    )
    exploration = records.get("pose_exploration", verify=True)
    assert str(exploration.record_id) == "aa3bd371-01cc-5013-bb06-338fd50a19d4"
    assert len(exploration.evidence) == 6 and len(exploration.supporting_evidence) == 5
    assert str(exploration.supporting_evidence[-1].job_id) == (
        "448af5fb-2957-4f08-b3c9-3fbd5f84a9d1"
    )
    cluster = ExamplePins(store, settings.state_dir, modules=MODULES).get(
        "pose.cluster", verify=True
    )
    assert str(cluster.job_id) == "18c3c20f-70e0-455b-89ff-bff6735c6843"
    assert cluster.review and exploration.review
    library_pins = ExamplePins(store, settings.state_dir, modules=MODULES)
    assert str(library_pins.get("library.import", verify=True).job_id) == (
        "1b34aff9-9daf-4c44-a47e-e29adb76313b"
    )
    selected = library_pins.get("library.select", verify=True)
    assert str(selected.job_id) == "1f9725ee-9075-4ef8-aec9-9de8cefd8124"
    assert [str(row.job_id) for row in selected.supporting_evidence] == [
        "b6bf5f47-2d73-4014-aadd-6ed7105b8d25",
        "d0cc112e-9978-4ca4-b9c2-fca33abd1c1c",
        "91d8a0c6-b093-45bf-8334-6e2b1af614e0",
    ]
    indexed = library_pins.get("drugclip.index", verify=True)
    assert str(indexed.job_id) == "f027c8d6-9b47-4455-abf9-4f545d624642"
    assert indexed.review and [str(row.job_id) for row in indexed.supporting_evidence] == [
        "8f68fd01-eb6a-43db-9230-d28904d42107",
        "487253fc-aeb4-4e0b-ab44-39d459e5ef34",
    ]
    retrieved = library_pins.get("drugclip.screen", verify=True)
    assert str(retrieved.job_id) == "8f0e8e38-02d1-4753-a736-6d0619355967"
    assert retrieved.review and [str(row.job_id) for row in retrieved.supporting_evidence] == [
        "63cdb6e0-a698-4b44-8d1f-127e88782b13",
        "636bee83-ae2f-4b2e-8f52-36ca6031068c",
    ]
    assert not {"fce65413-b248-4659-b7f3-5dabaef15b4a", "0ed1be39-410d-4b66-b6a3-fb4aaf9d02e9"} & {
        row.id for row in jobs
    }
    disease = library_pins.get("discovery.disease", verify=True)
    assert str(disease.job_id) == "0ea187a3-59ac-4478-96d2-c29f72168c1f" and disease.review
    assert disease.artifact_sha256["source-01.json"] == (
        "db5307903f9a2480ada5ea50cdf5c24efe6a50206b505e190b38d28087fb01c1"
    )
    docked = library_pins.get("screening.dock", verify=True)
    assert str(docked.job_id) == "c3d97cc9-a7ec-401d-a1ed-20c3bbb9404d" and docked.review
    assert [str(row.job_id) for row in docked.supporting_evidence] == [
        "7e29f874-81a8-4526-8dde-209e4ba03c92",
        "b00f1296-cf14-4ace-b59a-8aa74bdbf604",
    ]
    assert docked.artifact_sha256["receptor.pdb"] == (
        "a7f43f32a2c30345797b65664752c51b57a8827af798033577f02d8f61b230a8"
    )
    retained_states = retained_state_roundtrip(settings, store, assets, tmp_path)
    retained_model_regions = retained_model_and_regions(settings, store, assets, tmp_path)
    diversification = retained_diversification(settings, store, library_pins)
    optimization = retained_optimization(settings, store, library_pins)
    interface = retained_interface(settings, store, tmp_path)
    evidence = Path("outputs/stat6-case-data")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "installation.json").write_text(
        json.dumps(
            {
                "source_revision": spec.SOURCE_REVISION,
                "data_version": spec.VERSION,
                "bundle_sha256": spec.SHA256,
                "modules": len(spec.CAPABILITIES),
                "native_jobs": len(jobs),
                "core_templates": sum(
                    MODULES[cap].parent_capability is None for cap in spec.CAPABILITIES
                ),
                "nested_clustering_example": True,
                "retained_record_followup_stages": 5,
                "native_plip_job": str(pin.job_id),
                "contact_count": 11,
                "existing_attachment_unchanged": True,
                "idempotent_replay": True,
                "native_state_collection_replayed": retained_states,
                "native_model_and_region_subset_replayed": retained_model_regions,
                "retained_diversification_control_stages": diversification,
                "retained_optimization_control_stages": optimization,
                "retained_complete_protein_interface": interface,
                "new_scientific_tasks": 0,
                "experimental_activity_claim": False,
            },
            indent=2,
        )
    )
