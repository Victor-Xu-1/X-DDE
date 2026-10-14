"""Native-manifest transfer fixtures exercise integrity, never scientific inference."""

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


def native_files(output, source=None):
    source = source or {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}
    task = IntegratedTask(
        operation="electrostatics",
        name="Manifest transfer fixture",
        inputs=[{"role": "structure", "source": source}],
        scientific_inputs=[source],
        payload={"kind": "apbs"},
    )
    content = {
        "structure.pdb": b"Controlled coordinate fixture\n",
        "potential.dx": b"Controlled potential fixture\n",
        "charges.pqr": b"Controlled charge fixture\n",
        "solver.in": b"Controlled solver fixture\n",
    }
    output.mkdir(parents=True, exist_ok=True)
    for name, data in content.items():
        (output / name).write_bytes(data)
    result = {
        "operation": "electrostatics",
        "program": "apbs",
        "version": "protocol fixture",
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "artifact_sha256": {
            name: hashlib.sha256(data).hexdigest() for name, data in content.items()
        },
        "structure_artifact": "structure.pdb",
        "potential_artifact": "potential.dx",
        "potential_unit": "kBT/e",
    }
    (output / "result.json").write_text(json.dumps(result))
    return task, content


def test_declared_potential_and_charge_files_survive_archive_projection(tmp_path):
    task, content = native_files(tmp_path)
    paths = archive_sources(SimpleNamespace(request=task), tmp_path)
    assert set(paths) == set(content)
    assert {name: file.read_bytes() for name, file in paths.items()} == content


@pytest.mark.parametrize("change", ["missing", "corrupt", "different_request"])
def test_invalid_native_potential_inventory_fails_closed(tmp_path, change):
    task, _ = native_files(tmp_path)
    if change == "missing":
        (tmp_path / "potential.dx").unlink()
    elif change == "corrupt":
        (tmp_path / "potential.dx").write_bytes(b"Changed grid")
    else:
        task = task.model_copy(update={"name": "Different native request"})
    with pytest.raises((ValueError, FileNotFoundError)):
        archive_sources(SimpleNamespace(request=task), tmp_path)


def test_old_sealed_pins_validate_the_transitive_manifest_without_rewriting_it(settings):
    settings.state_dir.mkdir()
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    asset = assets.save("protocol-input.pdb", "structure", b"Controlled input fixture\n")
    task, _ = native_files(
        settings.state_dir / "prototype",
        {"asset_id": asset.id, "sha256": asset.sha256, "record": 0, "conformer": 0},
    )
    job = store.create(task, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    task, _ = native_files(output)
    # Preserve the exact task snapshot authored for this job.
    value = json.loads((output / "result.json").read_text())
    value["request_sha256"] = hashlib.sha256(job.request.model_dump_json().encode()).hexdigest()
    (output / "result.json").write_text(json.dumps(value))
    store.bind_environment(job.id, capture(settings, "opendde"))
    store.finish(job.id, Status.SUCCEEDED)
    evidence = capture_job(store, settings.state_dir, job.id)
    assert "potential.dx" not in evidence.artifact_sha256
    verify_job(store, settings.state_dir, evidence)
    assert capture_job(store, settings.state_dir, job.id) == evidence
    (output / "charges.pqr").write_bytes(b"Changed charge file")
    with pytest.raises(ValueError, match="artifact bytes changed"):
        verify_job(store, settings.state_dir, evidence)
