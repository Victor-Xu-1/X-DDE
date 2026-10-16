"""Install the exact published STAT6 native data through the real component queue."""

import hashlib
import json
import os
import shutil
from pathlib import Path

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.examples import stat6_bundle_release as spec
from opendde_workbench.examples.bundle import restore_bundle, verify_examples
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.store import Store

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_REVIEWED_STAT6_ARCHIVE"), reason="Select the actual published-data gate."
)


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
    assert installed["computed"] == len(spec.CAPABILITIES) == 25
    expected = {"modules": 25, "computed": 25, "validated": 0}
    assert restore_bundle(archive, settings, spec.SHA256) == expected
    assert verify_examples(settings, spec.CAPABILITIES, profile="stat6") == expected
    assert assets.path(original).read_bytes() == original_bytes
    jobs = store.list_jobs()
    assert len(jobs) == 31 and not any(
        row.status in {"queued", "running", "cancelling"} for row in jobs
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
    evidence = Path("outputs/stat6-case-data")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "installation.json").write_text(
        json.dumps(
            {
                "source_revision": spec.SOURCE_REVISION,
                "data_version": spec.VERSION,
                "bundle_sha256": spec.SHA256,
                "modules": 25,
                "native_jobs": 31,
                "native_plip_job": str(pin.job_id),
                "contact_count": 11,
                "existing_attachment_unchanged": True,
                "idempotent_replay": True,
                "new_scientific_tasks": 0,
                "experimental_activity_claim": False,
            },
            indent=2,
        )
    )
