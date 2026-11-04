import hashlib
import io
import json
import zipfile
from types import SimpleNamespace

import pytest

from opendde_workbench.prediction_sample_export import BOLTZ_OUTPUT, sample_zip


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
    with pytest.raises(ValueError, match="no retained source checksum"):
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
    job, output = manifest(
        tmp_path,
        "mol1_predict",
        "mol1",
        [{"id": key, "artifact": name}],
        {name: b"data_mol1", summary_name: summary},
        mol1={
            "model": "mol-1-base",
            "samples": [
                {"candidate_id": key, "seed": 101, "rank": 0, "summary_artifact": summary_name}
            ],
            "confidence_axes": "token_indices_not_residue_numbers",
            "scope": "model_confidence_not_experimental_binding",
        },
    )
    assert unpack(tmp_path, job, key) == {"structure": b"data_mol1", "confidence_summary": summary}
    (output / summary_name).write_bytes(b'{"plddt":40}')
    with pytest.raises(ValueError, match="changed after it was recorded"):
        sample_zip(tmp_path, job, key)
