"""Exact stopped-task lineage and bounded native stage-copy boundaries, no inference."""

import hashlib
import json
import zipfile
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.integrations.binder_checkpoints import describe, validate_continuation
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.native_binder_checkpoint import allowed, inventory, restore


def stages(root):
    folder = root / "intermediate_designs"
    folder.mkdir(parents=True)
    (folder / "design_00.cif").write_text("data_native_storage_fixture\n")
    with zipfile.ZipFile(folder / "design_00.npz", "w") as z:
        z.writestr("coordinates.npy", b"sealed array transport fixture, not model input")
    return folder


@pytest.fixture
def source(tmp_path):
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    request = IntegratedTask(
        operation="boltzgen_design",
        name="STAT6 stopped native binder study",
        scientific_inputs=[ref],
        inputs=[{"role": "structure", "source": ref}],
        payload={"kind": "boltzgen", "target_chains": ["A"], "candidates": 2, "retain": 1},
        options={"device": "cuda", "memory_mib": 6144},
    )
    job = SimpleNamespace(id=uuid4(), status="interrupted", request=request)
    directory = tmp_path / "jobs" / str(job.id)
    stages(directory / "output/native/designs")
    adapter = directory / "adapter"
    adapter.mkdir()
    checksums = {}
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench/integrations"
    for name in ("native_boltzgen.py", "native_resources.py", "recipes.json"):
        data = (root / name).read_bytes()
        (adapter / name).write_bytes(data)
        checksums[name] = hashlib.sha256(data).hexdigest()
    (directory / "boltzgen-execution.json").write_text(
        json.dumps({"image": "sha256:" + "b" * 64, "adapter_sha256": checksums})
    )
    (directory / "request.json").write_text(request.model_dump_json())
    store = SimpleNamespace(
        get=lambda identifier: job if identifier == str(job.id) else None, queue_halt=lambda: None
    )
    return job, store, directory


def continuation(source, state):
    job, store, _ = source
    summary = describe(state, store, job.id)
    body = job.request.model_dump(mode="json")
    body["name"] = "Explicit continuation"
    body["payload"]["continuation"] = {key: summary[key] for key in ("job_id", "sha256")}
    return IntegratedTask.model_validate(body)


def test_reviewed_checkpoint_copies_only_original_calculated_bytes_without_mutating_parent(
    source, tmp_path
):
    job, store, directory = source
    assert "continuation" not in job.request.model_dump()["payload"]
    summary = describe(tmp_path, store, job.id)
    assert summary["counts"] == {
        "generated": 1,
        "inverse_folded": 0,
        "complex_refolded": 0,
        "binder_refolded": 0,
    }
    original = directory / "output/native/designs"
    before = inventory(original, 2)
    selected, manifest = validate_continuation(continuation(source, tmp_path), tmp_path, store)
    assert selected == directory
    target = tmp_path / "new-task-output"
    restore(original, target, manifest["files"], 2)
    assert inventory(target, 2) == before == inventory(original, 2)
    assert job.status == "interrupted"
    with pytest.raises(ValueError, match="empty native"):
        restore(original, target, manifest["files"], 2)


@pytest.mark.parametrize("status", ["running", "queued", "paused", "succeeded", "cancelling"])
def test_live_or_complete_parents_cannot_be_continued(source, tmp_path, status):
    job, store, _ = source
    job.status = status
    with pytest.raises(ValueError, match="stopped"):
        describe(tmp_path, store, job.id)


@pytest.mark.parametrize("change", ["input", "plan", "resources", "digest"])
def test_checkpoint_rejects_changed_inputs_design_budget_resources_and_review_digest(
    source, tmp_path, change
):
    _, store, _ = source
    body = continuation(source, tmp_path).model_dump(mode="json")
    if change == "input":
        body["inputs"][0]["source"]["sha256"] = "c" * 64
        body["scientific_inputs"] = [body["inputs"][0]["source"]]
    elif change == "plan":
        body["payload"]["length"] = [20, 40]
    elif change == "resources":
        body["options"]["memory_mib"] = 4096
    else:
        body["payload"]["continuation"]["sha256"] = "d" * 64
    with pytest.raises(ValueError, match="exact original|changed after"):
        validate_continuation(IntegratedTask.model_validate(body), tmp_path, store)


def test_mutable_or_unconfirmed_native_sources_fail_closed(source, tmp_path):
    job, store, directory = source
    request = continuation(source, tmp_path)
    file = directory / "output/native/designs/intermediate_designs/design_00.cif"
    file.write_text("changed after inspection")
    with pytest.raises(ValueError, match="changed after"):
        validate_continuation(request, tmp_path, store)
    store.queue_halt = lambda: {"job_id": str(job.id)}
    with pytest.raises(ValueError, match="cleanup"):
        describe(tmp_path, store, job.id)


@pytest.mark.parametrize(
    "name",
    [
        "../escape.cif",
        "/absolute.npz",
        "intermediate_designs/../../escape.npz",
        "intermediate_designs/design_0.py",
        "intermediate_designs\\design_0.cif",
        "intermediate_designs/refold_cif/design_00.cif",
    ],
)
def test_no_browser_or_manifest_path_can_escape_the_calculated_stage(name):
    assert not allowed(name)


def test_native_generation_resume_rejects_holes_the_upstream_max_index_skip_cannot_fill(tmp_path):
    root = tmp_path / "stages"
    folder = stages(root)
    for suffix in (".cif", ".npz"):
        (folder / ("design_02" + suffix)).write_bytes(
            (folder / ("design_00" + suffix)).read_bytes()
        )
    with pytest.raises(ValueError, match="contiguous prefix"):
        inventory(root, 3)
    for suffix in (".cif", ".npz"):
        (folder / ("design_01" + suffix)).write_bytes(
            (folder / ("design_00" + suffix)).read_bytes()
        )
    assert len(inventory(root, 3)) == 6


def test_native_checkpoint_rejects_truncated_arrays_missing_pairs_symlinks_and_oversize(
    tmp_path, monkeypatch
):
    root = tmp_path / "stages"
    folder = stages(root)
    array = folder / "design_00.npz"
    array.write_bytes(b"truncated zip")
    with pytest.raises(ValueError, match="invalid"):
        inventory(root, 2)
    array.unlink()
    with pytest.raises(ValueError, match="matching native"):
        inventory(root, 2)
    (folder / "design_00.cif").unlink()
    (folder / "design_00.cif").symlink_to(tmp_path / "outside")
    with pytest.raises(ValueError, match="symbolic"):
        inventory(root, 2)
    (folder / "design_00.cif").unlink()
    (folder / "design_00.cif").write_bytes(b"too large")
    monkeypatch.setattr("opendde_workbench.integrations.native_binder_checkpoint.MAX_FILE_BYTES", 2)
    with pytest.raises(ValueError, match="size boundary"):
        inventory(root, 2)


def test_checkpoint_inspection_api_is_read_only_and_redacts_storage_errors(source, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from opendde_workbench.integrations.routes import register_scientific_routes

    job, store, directory = source
    app = FastAPI()
    register_scientific_routes(app, store, SimpleNamespace(state_dir=tmp_path), None, lambda: None)
    with TestClient(app) as client:
        response = client.get(f"/api/scientific/binder-checkpoints/{job.id}")
        assert response.status_code == 200
        assert response.json() == describe(tmp_path, store, job.id)
        assert str(directory) not in response.text
        assert client.get("/api/scientific/binder-checkpoints/not-a-uuid").status_code == 422
        job.status = "running"
        response = client.get(f"/api/scientific/binder-checkpoints/{job.id}")
        assert response.status_code == 409
        assert str(directory) not in response.text


def test_continuation_uses_readonly_exact_source_mounts_and_original_image(
    source, tmp_path, settings, monkeypatch
):
    from opendde_workbench.integrations.backend import ScientificBackend

    _, store, directory = source
    request = continuation(source, tmp_path)
    backend = ScientificBackend(settings, "boltzgen")
    backend.settings = SimpleNamespace(state_dir=tmp_path)
    models = tmp_path / "models"
    models.mkdir()
    image = "sha256:" + "b" * 64
    monkeypatch.setattr("opendde_workbench.integrations.backend.Store", lambda path: store)
    monkeypatch.setattr(
        "opendde_workbench.integrations.backend.configuration",
        lambda *args: (image, {"models": str(models)}),
    )
    monkeypatch.setattr(
        "opendde_workbench.container_runtime.selection", lambda *args: (image, None, None)
    )
    child = tmp_path / "child"
    child.mkdir()
    arguments = backend.execution_arguments(SimpleNamespace(request=request), child)
    assert (
        f"type=bind,source={directory / 'output/native/designs'},"
        "target=/input/binder-checkpoint,readonly" in arguments
    )
    manifest = json.loads((child / "binder-checkpoint.json").read_text())
    assert manifest["image"] == image
    assert (
        directory / "output/native/designs/intermediate_designs/design_00.cif"
    ).read_text() == "data_native_storage_fixture\n"
    monkeypatch.setattr(
        "opendde_workbench.container_runtime.selection",
        lambda *args: ("sha256:" + "c" * 64, None, None),
    )
    with pytest.raises(ValueError, match="exact original native binder image"):
        backend.execution_arguments(SimpleNamespace(request=request), child)


def test_continued_result_requires_the_exact_sealed_source_receipt(source, tmp_path):
    from opendde_workbench.integrations.binder_checkpoints import checkpoint
    from opendde_workbench.integrations.result import validate_result

    job, store, _ = source
    request = continuation(source, tmp_path)
    _, _, manifest = checkpoint(tmp_path, store, job.id)
    output = tmp_path / "output"
    output.mkdir()
    (output / "binder.cif").write_text("native artifact fixture")
    value = {
        "operation": "boltzgen_design",
        "program": "boltzgen",
        "version": "0.3.2",
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
        "candidates": [{"id": "binder-001", "artifact": "binder.cif"}],
        "artifact_sha256": {
            "binder.cif": hashlib.sha256((output / "binder.cif").read_bytes()).hexdigest()
        },
    }
    with pytest.raises(ValueError, match="no sealed source"):
        validate_result(value, request, output)
    receipt = output / "binder-continuation-source.json"
    receipt.write_text(json.dumps(manifest))
    value["artifact_sha256"][receipt.name] = hashlib.sha256(receipt.read_bytes()).hexdigest()
    assert validate_result(value, request, output).program == "boltzgen"
    manifest["job_id"] = str(uuid4())
    receipt.write_text(json.dumps(manifest))
    value["artifact_sha256"][receipt.name] = hashlib.sha256(receipt.read_bytes()).hexdigest()
    with pytest.raises(ValueError, match="different source"):
        validate_result(value, request, output)
