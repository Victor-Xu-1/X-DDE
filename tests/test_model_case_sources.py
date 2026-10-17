"""Portable checkpoint integrity fixtures; these bytes are not a trained model."""

import hashlib
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle_sources import archive_sources
from opendde_workbench.examples.evidence import capture_job, verify_job
from opendde_workbench.execution_environment import capture
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.models import Status
from opendde_workbench.store import Store


def model_files(output, source=None):
    source = source or {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}
    task = IntegratedTask(
        operation="chemprop_train",
        name="Controlled model transfer fixture",
        inputs=[{"role": "library", "source": source}],
        scientific_inputs=[source],
        payload={"kind": "chemprop", "mode": "train"},
    )
    content = {"property-model.pt": b"Controlled checkpoint transport fixture; never execute\n"}
    output.mkdir(parents=True, exist_ok=True)
    for name, data in content.items():
        (output / name).write_bytes(data)
    result = {
        "operation": "chemprop_train",
        "program": "chemprop",
        "version": "protocol fixture",
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "artifact_sha256": {
            name: hashlib.sha256(data).hexdigest() for name, data in content.items()
        },
        "model_artifact": "property-model.pt",
    }
    (output / "result.json").write_text(json.dumps(result))
    return task, content


def test_model_checkpoint_is_a_portable_manifest_dependency(tmp_path):
    task, content = model_files(tmp_path)
    paths = archive_sources(SimpleNamespace(request=task), tmp_path)
    assert {name: path.read_bytes() for name, path in paths.items()} == content


@pytest.mark.parametrize("change", ["missing", "corrupt", "different_request", "unsealed"])
def test_model_transfer_rejects_missing_or_changed_checkpoint_evidence(tmp_path, change):
    task, _ = model_files(tmp_path)
    if change == "missing":
        (tmp_path / "property-model.pt").unlink()
    elif change == "corrupt":
        (tmp_path / "property-model.pt").write_bytes(b"Different checkpoint")
    elif change == "different_request":
        task = task.model_copy(update={"name": "Another authored task"})
    else:
        value = json.loads((tmp_path / "result.json").read_bytes())
        value["artifact_sha256"] = {"unrelated.csv": "a" * 64}
        (tmp_path / "result.json").write_text(json.dumps(value))
    with pytest.raises((ValueError, FileNotFoundError)):
        archive_sources(SimpleNamespace(request=task), tmp_path)


def test_sealed_model_case_verifies_binary_bytes_without_changing_its_pin(settings):
    settings.state_dir.mkdir()
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    asset = assets.save("controlled-source.sdf", "ligand", b"Controlled source fixture\n")
    task, _ = model_files(
        settings.state_dir / "prototype",
        {
            "asset_id": asset.id,
            "sha256": asset.sha256,
            "record": 0,
            "conformer": 0,
        },
    )
    job = store.create(task, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    model_files(output, task.inputs[0].source.model_dump(mode="json"))
    store.bind_environment(job.id, capture(settings, "opendde"))
    store.finish(job.id, Status.SUCCEEDED)
    evidence = capture_job(store, settings.state_dir, job.id)
    # Legacy pin inventories remain unchanged; result.json seals the checkpoint transitively.
    assert "property-model.pt" not in evidence.artifact_sha256
    verify_job(store, settings.state_dir, evidence)
    assert capture_job(store, settings.state_dir, job.id) == evidence
    (output / "property-model.pt").write_bytes(b"Changed native binary")
    with pytest.raises(ValueError, match="artifact bytes changed"):
        capture_job(store, settings.state_dir, job.id)
    with pytest.raises(ValueError, match="artifact bytes changed"):
        verify_job(store, settings.state_dir, evidence)
