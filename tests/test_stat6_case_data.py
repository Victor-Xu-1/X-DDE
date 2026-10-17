"""Install the exact published STAT6 native data through the real component queue."""

import hashlib
import json
import os
import shutil
from dataclasses import replace
from pathlib import Path

import pytest

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


def test_real_current_data_queue_replay_original_inputs_and_native_plip(
    settings, tmp_path, monkeypatch
):
    archive = Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"])
    assert archive.stat().st_size == spec.BYTES
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == spec.SHA256
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
    assert installed["computed"] == len(spec.CAPABILITIES) == 28
    expected = {"modules": 28, "computed": 28, "validated": 0}
    assert restore_bundle(archive, settings, spec.SHA256) == expected
    assert verify_examples(settings, spec.CAPABILITIES, profile="stat6") == expected
    assert assets.path(original).read_bytes() == original_bytes
    jobs = store.list_jobs()
    assert len(jobs) == 46 and not any(
        row.status in {"queued", "running", "cancelling"} for row in jobs
    )
    generated = ExamplePins(store, settings.state_dir, modules=MODULES).get(
        "diffsbdd.generate", verify=True
    )
    assert str(generated.job_id) == "be6389cf-e6ce-4d2e-ae5a-9786d62dfe8a"
    assert generated.review and len(generated.supporting_evidence) == 5
    assert str(generated.supporting_evidence[-1].job_id) == (
        "b5b7a896-929b-45ad-88b9-e147c5b7540f"
    )
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
    retained_states = retained_state_roundtrip(settings, store, assets, tmp_path)
    evidence = Path("outputs/stat6-case-data")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "installation.json").write_text(
        json.dumps(
            {
                "source_revision": spec.SOURCE_REVISION,
                "data_version": spec.VERSION,
                "bundle_sha256": spec.SHA256,
                "modules": 27,
                "native_jobs": 40,
                "core_templates": 26,
                "nested_clustering_example": True,
                "retained_record_followup_stages": 5,
                "native_plip_job": str(pin.job_id),
                "contact_count": 11,
                "existing_attachment_unchanged": True,
                "idempotent_replay": True,
                "native_state_collection_replayed": retained_states,
                "new_scientific_tasks": 0,
                "experimental_activity_claim": False,
            },
            indent=2,
        )
    )
