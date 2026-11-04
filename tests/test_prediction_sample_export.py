import asyncio
import hashlib
import io
import json
import time
import zipfile
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.models import Prediction, Status
from opendde_workbench.prediction_archive import ArchiveCancelled, prediction_archive
from opendde_workbench.prediction_sample_export import (
    BOLTZ_OUTPUT,
    UnsealedPredictionSource,
    sample_zip,
)
from opendde_workbench.science_routes import register_science
from opendde_workbench.store import Store


def manifest(root, operation, program, candidates, files, **extra):
    request = SimpleNamespace(
        operation=operation,
        payload=SimpleNamespace(kind=program, samples=2),
        model_dump_json=lambda: '{"sealed":true}',
    )
    output = root / "output"
    output.mkdir()
    for name, data in files.items():
        (output / name).write_bytes(data)
    result = {
        "operation": operation,
        "program": program,
        "version": "test",
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
        "candidates": candidates,
        "artifact_sha256": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
        **extra,
    }
    (output / "result.json").write_text(json.dumps(result))
    return SimpleNamespace(id="source", request=request), output


def unpack(root, job, candidate, sealed=None):
    with zipfile.ZipFile(io.BytesIO(sample_zip(root, job, candidate, sealed))) as archive:
        receipt = json.loads(archive.read("sample.json"))
        files = {role: archive.read(value["member"]) for role, value in receipt["files"].items()}
        assert all(
            receipt["files"][key]["sha256"] == hashlib.sha256(data).hexdigest()
            for key, data in files.items()
        )
        return files


def test_retained_opendde_uses_cached_candidate_and_own_summary(tmp_path):
    analysis = tmp_path / "analysis"
    analysis.mkdir()
    output = tmp_path / "output"
    output.mkdir()
    summary = b'{"ranking_score":0.8}'
    (analysis / "workbench-analysis.json").write_text(
        json.dumps(
            {
                "schema_version": 4,
                "candidates": [
                    {
                        "id": "seed-101-sample-0",
                        "artifact": "job_sample_0.cif",
                        "ranking_score": 0.8,
                        "artifact_sha256": hashlib.sha256(b"data_0").hexdigest(),
                        "summary_sha256": hashlib.sha256(summary).hexdigest(),
                    },
                    {
                        "id": "seed-101-sample-1",
                        "artifact": "job_sample_1.cif",
                        "artifact_sha256": hashlib.sha256(b"data_1").hexdigest(),
                    },
                    {"id": "legacy", "artifact": "job_sample_1.cif"},
                ],
            }
        )
    )
    (output / "job_sample_0.cif").write_bytes(b"data_0")
    (output / "job_sample_1.cif").write_bytes(b"data_1")
    (output / "job_summary_confidence_sample_0.json").write_bytes(summary)
    job = SimpleNamespace(id="source", request=SimpleNamespace(operation="predict"))
    assert unpack(tmp_path, job, "seed-101-sample-0") == {
        "structure": b"data_0",
        "confidence_summary": summary,
    }
    assert unpack(tmp_path, job, "seed-101-sample-1") == {"structure": b"data_1"}
    with pytest.raises(UnsealedPredictionSource, match="no retained source checksum"):
        sample_zip(tmp_path, job, "legacy")
    (output / "job_sample_0.cif").write_bytes(b"data_1")
    with pytest.raises(ValueError, match="changed after it was recorded"):
        sample_zip(tmp_path, job, "seed-101-sample-0")
    with pytest.raises(FileNotFoundError):
        sample_zip(tmp_path, job, "wrong")


def test_boltz_resolves_summary_by_native_structure_bytes(tmp_path):
    name = "structure-002.cif"
    job, output = manifest(
        tmp_path,
        "boltz_predict",
        "boltz",
        [
            {
                "id": "structure-002",
                "artifact": name,
                "metrics": [
                    {
                        "name": "confidence_score",
                        "value": 0.8,
                        "unit": "0–1",
                        "method": "native",
                        "meaning": "confidence",
                    }
                ],
            }
        ],
        {name: b"data_selected"},
    )
    native = output / BOLTZ_OUTPUT
    native.mkdir(parents=True)
    (native / "prediction_model_0.cif").write_bytes(b"data_different")
    (native / "prediction_model_1.cif").write_bytes(b"data_selected")
    summary = b'{"confidence_score":0.8}'
    (native / "confidence_prediction_model_1.json").write_bytes(summary)
    sealed = {
        file.relative_to(output).as_posix(): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in native.iterdir()
    }
    assert unpack(tmp_path, job, "structure-002") == {"structure": b"data_selected"}
    assert unpack(tmp_path, job, "structure-002", sealed) == {
        "structure": b"data_selected",
        "confidence_summary": summary,
    }
    incomplete = {key: value for key, value in sealed.items() if not key.endswith("_0.cif")}
    assert unpack(tmp_path, job, "structure-002", incomplete) == {"structure": b"data_selected"}

    sidecar = native / "confidence_prediction_model_1.json"
    sidecar.write_bytes(b'{"confidence_score":0.8,"changed":true}')
    with pytest.raises(ValueError, match="changed after it was recorded"):
        sample_zip(tmp_path, job, "structure-002", sealed)

    # The remaining candidate has the same bytes and rank, but a different
    # native report. A missing original source cannot make this a valid match.
    duplicate = native / "prediction_model_0.cif"
    duplicate.write_bytes(b"data_selected")
    other_summary = native / "confidence_prediction_model_0.json"
    other_summary.write_bytes(b'{"confidence_score":0.8,"chain_pair":0.7}')
    for file in (duplicate, other_summary):
        sealed[file.relative_to(output).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    (native / "prediction_model_1.cif").unlink()
    assert unpack(tmp_path, job, "structure-002", sealed) == {"structure": b"data_selected"}


def test_current_boltz_uses_the_declared_sidecar_without_raw_tree(tmp_path):
    key = "structure-001"
    summary = b'{"confidence_score":0.8}'
    job, _ = manifest(
        tmp_path,
        "boltz_predict",
        "boltz",
        [{"id": key, "artifact": key + ".cif"}],
        {key + ".cif": b"native", key + "-confidence.json": summary},
    )
    assert unpack(tmp_path, job, key) == {"structure": b"native", "confidence_summary": summary}


def test_mol1_requires_declared_summary_identity(tmp_path):
    key = "seed-101-rank-0"
    name = key + ".cif"
    summary_name = key + "-confidence.json"
    summary = b'{"plddt":84}'
    full_name = key + "-full-data.json"
    full = b'{"token_pair_pae":[[0]]}'
    job, output = manifest(
        tmp_path,
        "mol1_predict",
        "mol1",
        [{"id": key, "artifact": name}],
        {name: b"data_mol1", summary_name: summary, full_name: full},
        mol1={
            "model": "mol-1-base",
            "samples": [
                {
                    "candidate_id": key,
                    "seed": 101,
                    "rank": 0,
                    "summary_artifact": summary_name,
                    "full_data_artifact": full_name,
                }
            ],
            "confidence_axes": "token_indices_not_residue_numbers",
            "scope": "model_confidence_not_experimental_binding",
        },
    )
    assert unpack(tmp_path, job, key) == {"structure": b"data_mol1", "confidence_summary": summary}
    request_sha = hashlib.sha256(job.request.model_dump_json().encode()).hexdigest()
    stream, _ = prediction_archive(tmp_path, job, request_sha, {})
    with stream, zipfile.ZipFile(stream) as archive:
        assert archive.read(f"outputs/{full_name}") == full
    (output / summary_name).write_bytes(b'{"plddt":40}')
    with pytest.raises(ValueError, match="changed after it was recorded"):
        sample_zip(tmp_path, job, key)
    with pytest.raises(ValueError, match="recorded checksum"):
        prediction_archive(tmp_path, job, request_sha, {})


def test_download_route_distinguishes_missing_and_replaced_sources(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    job = store.create(
        Prediction(
            name="Retained prediction",
            components=[{"kind": "protein", "value": "ACDEFGHIKLMNPQRSTVWY", "count": 1}],
        ),
        str(uuid4()),
        5,
        20,
    )
    assert store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    root = tmp_path / "jobs" / job.id
    (root / "output").mkdir(parents=True)
    (root / "analysis").mkdir()
    name = "job_sample_0.cif"
    (root / "output" / name).write_bytes(b"retained")
    cache = root / "analysis" / "workbench-analysis.json"
    row = {"id": "seed-101-sample-0", "artifact": name}
    cache.write_text(json.dumps({"schema_version": 4, "candidates": [row]}))

    app = FastAPI()
    register_science(app, store, object(), SimpleNamespace(state_dir=tmp_path))
    with TestClient(app) as client:
        endpoint = f"/api/jobs/{job.id}/prediction-sample.zip?candidate={row['id']}"
        result = client.get(endpoint)
        assert result.status_code == 409
        assert result.json()["detail"]["code"] == "legacy_unsealed_structure"

        row["artifact_sha256"] = hashlib.sha256(b"other coordinates").hexdigest()
        cache.write_text(json.dumps({"schema_version": 4, "candidates": [row]}))
        result = client.get(endpoint)
        assert result.status_code == 422
        assert "legacy_unsealed_structure" not in result.text


def test_job_archive_retains_native_alignment_and_full_confidence(tmp_path):
    output = tmp_path / "jobs" / "source" / "output"
    prediction = output / "source" / "seed_101" / "predictions"
    prediction.mkdir(parents=True)
    native = output / "native" / "msa" / "A"
    native.mkdir(parents=True)
    files = {
        prediction / "source_sample_0.cif": b"coordinates",
        prediction / "source_summary_confidence_sample_0.json": b'{"ptm":0.7}',
        prediction / "source_full_data_sample_0.json": b'{"token_pair_pae":[[0]]}',
        native / "pairing.a3m": b">protein\nACDE\n",
    }
    for path, data in files.items():
        path.write_bytes(data)
    (output / "runtime.json").write_text('{"implementation":"private"}')
    (native / "unrelated.a3m").write_text(">unrelated\nACDE\n")
    full = prediction / "source_full_data_sample_0.json"
    sealed = {full.relative_to(output).as_posix(): hashlib.sha256(files[full]).hexdigest()}
    job = SimpleNamespace(
        id="source",
        request=SimpleNamespace(
            operation="predict", parameters=SimpleNamespace(seeds=[101], samples=2)
        ),
    )
    stream, size = prediction_archive(output.parent, job, "a" * 64, sealed)
    with stream, zipfile.ZipFile(stream) as archive:
        receipt = json.loads(archive.read("prediction.json"))
        assert receipt["source_job"] == "source"
        assert receipt["request_sha256"] == "a" * 64
        assert receipt["limitations"] == [
            "The archive does not establish a complete set of requested OpenDDE samples."
        ]
        assert size > 0
        names = {
            "outputs/" + path.relative_to(output).as_posix(): data for path, data in files.items()
        }
        assert set(archive.namelist()) == {*names, "prediction.json"}
        assert all(archive.read(name) == data for name, data in names.items())
        confidence = next(
            row for row in receipt["files"].values() if row["role"] == "confidence_full"
        )
        assert confidence["matched_recorded_checksum"] is True
    full.write_text("replaced confidence")
    with pytest.raises(ValueError, match="recorded checksum"):
        prediction_archive(output.parent, job, "a" * 64, sealed)
    full.unlink()
    with pytest.raises(FileNotFoundError):
        prediction_archive(output.parent, job, "a" * 64, sealed)


def test_unsealed_boltz_uses_verified_normalized_files_and_retains_affinity(tmp_path):
    candidates = [{"id": f"structure-00{i}", "artifact": f"structure-00{i}.cif"} for i in (1, 2)]
    job, output = manifest(
        tmp_path,
        "boltz_predict",
        "boltz",
        candidates,
        {
            "structure-001.cif": b"one",
            "structure-002.cif": b"two",
            "structure-001-confidence.json": b'{"ptm":0.8}',
            "structure-002-confidence.json": b'{"ptm":0.7}',
        },
        metrics=[
            {
                "name": "affinity_pred_value",
                "value": 0.4,
                "unit": "log10(IC50 / µM)",
                "method": "Boltz-2",
                "meaning": "affinity prediction",
            }
        ],
    )
    native = output / BOLTZ_OUTPUT
    native.mkdir(parents=True)
    (native / "prediction_model_0.cif").write_bytes(b"two")
    (native / "prediction_model_1.cif").write_bytes(b"one")
    (native / "confidence_prediction_model_0.json").write_bytes(b'{"ptm":0.8}')
    request_sha = hashlib.sha256(job.request.model_dump_json().encode()).hexdigest()
    stream, _ = prediction_archive(tmp_path, job, request_sha, {})
    with stream, zipfile.ZipFile(stream) as archive:
        assert not any("/native/" in name for name in archive.namelist())
        assert (
            json.loads(archive.read("outputs/result.json"))["metrics"][0]["name"]
            == "affinity_pred_value"
        )
        assert json.loads(archive.read("prediction.json"))["limitations"]


def test_job_archive_releases_slot_after_disconnect_during_preparation(tmp_path, monkeypatch):
    import opendde_workbench.science_routes as routes

    store = Store(tmp_path / "jobs.sqlite3")
    job = store.create(
        Prediction(name="Completed", components=[{"kind": "protein", "value": "ACDE", "count": 1}]),
        str(uuid4()),
        5,
        20,
    )
    assert store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    started, stopped = Event(), Event()

    def prepare(_root, _job, _sha, _sealed, cancelled):
        if started.is_set():
            return io.BytesIO(b"valid bytes"), 11
        started.set()
        deadline = time.monotonic() + 5
        while not cancelled():
            if time.monotonic() >= deadline:
                raise AssertionError("Disconnect never reached archive worker")
            stopped.wait(0.01)
        stopped.set()
        raise ArchiveCancelled

    monkeypatch.setattr(routes, "prediction_archive", prepare)
    app = FastAPI()
    register_science(app, store, object(), SimpleNamespace(state_dir=tmp_path))
    endpoint = f"/api/jobs/{job.id}/prediction-results.zip"

    async def disconnect():
        response = []

        async def receive():
            while not started.is_set():
                await asyncio.sleep(0.01)
            return {"type": "http.disconnect"}

        async def send(message):
            response.append(message)

        await app(
            {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.4"},
                "method": "GET",
                "path": endpoint,
                "query_string": b"",
                "headers": [],
            },
            receive,
            send,
        )
        for _ in range(100):
            if stopped.is_set():
                break
            await asyncio.sleep(0.01)
        assert stopped.is_set()
        assert response[0]["status"] == 499

    asyncio.run(disconnect())
    with TestClient(app) as client:
        assert client.get(endpoint).content == b"valid bytes"
