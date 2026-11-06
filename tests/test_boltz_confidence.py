import hashlib
import json

import pytest
from confidence_array_fixture import floating, native_task, npz

from opendde_workbench.boltz_confidence import boltz_confidence_view
from opendde_workbench.integrations.boltz_result import validate_boltz_result
from opendde_workbench.integrations.result import NativeResult
from opendde_workbench.prediction_sample_export import BOLTZ_OUTPUT


@pytest.mark.parametrize("declared", [False, True])
def test_ranked_sample_matrix_units_and_read_only_provenance(tmp_path, declared):
    request, digest, output, _ = native_task(tmp_path, declared=declared, samples=2)
    before = {
        p.relative_to(output).as_posix(): p.read_bytes() for p in output.rglob("*") if p.is_file()
    }
    result = boltz_confidence_view(tmp_path, request, "structure-002", "pae", digest, bins=2)
    assert result["indices"] == [0, 2]
    assert result["matrix"] == [[1, 3], [7, 9]]
    assert result["token_plddt"] == [{"index": 0, "value": 0}, {"index": 2, "value": 1}]
    assert result["atom_plddt"] == [] and result["binding"] is None
    assert result["source_integrity"] == ("recorded" if declared else "current_files")
    assert (
        result["native_sha256"]
        == hashlib.sha256((output / result["native_artifact"]).read_bytes()).hexdigest()
    )
    assert before == {
        p.relative_to(output).as_posix(): p.read_bytes() for p in output.rglob("*") if p.is_file()
    }


def test_historical_identity_is_content_matched_not_candidate_order(tmp_path):
    request, digest, output, _ = native_task(tmp_path, samples=2)
    folder = output / BOLTZ_OUTPUT
    first, second = (folder / f"prediction_model_{i}.cif" for i in range(2))
    raw0, raw1 = first.read_bytes(), second.read_bytes()
    first.write_bytes(raw1)
    second.write_bytes(raw0)
    result = boltz_confidence_view(tmp_path, request, "structure-001", "pde", digest)
    assert result["matrix"][0][0] == 1
    first.write_bytes(raw0)
    with pytest.raises(ValueError, match="unambiguously"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)


def test_historical_directory_inventory_is_bounded_before_matching_files(tmp_path):
    request, digest, output, _ = native_task(tmp_path)
    for index in range(65):
        (output / BOLTZ_OUTPUT / f"extra-{index}.txt").write_text("fixture")
    with pytest.raises(ValueError, match="inventory exceeds"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)


def test_declared_sidecars_never_fall_back_to_unrecorded_historical_files(tmp_path):
    request, digest, output, result = native_task(tmp_path, declared=True)
    (output / "structure-001-pae.npz").write_bytes(b"changed")
    with pytest.raises(ValueError, match="changed after"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)
    (output / "structure-001-pae.npz").unlink()
    with pytest.raises(FileNotFoundError):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)
    del result["artifact_sha256"]["structure-001-pae.npz"]
    (output / "result.json").write_text(json.dumps(result))
    with pytest.raises(ValueError, match="recorded file"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)


def test_recorded_historical_hashes_are_checked_without_promoting_current_files(tmp_path):
    request, digest, output, _ = native_task(tmp_path)
    sealed = {
        p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in output.rglob("*.npz")
    }
    result = boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest, sealed)
    assert result["source_integrity"] == "recorded"
    (output / result["native_artifact"]).write_bytes(npz(pae=floating((3, 3), [0] * 9)))
    with pytest.raises(ValueError, match="changed after"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest, sealed)


def test_existing_pin_manifest_and_source_hashes_cannot_be_overridden(tmp_path):
    request, digest, output, result = native_task(tmp_path, declared=True)
    seal = {"result.json": hashlib.sha256((output / "result.json").read_bytes()).hexdigest()}
    changed = npz(pae=floating((3, 3), [0] * 9))
    (output / "structure-001-pae.npz").write_bytes(changed)
    old_digest = result["artifact_sha256"]["structure-001-pae.npz"]
    result["artifact_sha256"]["structure-001-pae.npz"] = hashlib.sha256(changed).hexdigest()
    (output / "result.json").write_text(json.dumps(result))
    with pytest.raises(ValueError, match="changed after"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest, seal)
    with pytest.raises(ValueError, match="disagree"):
        boltz_confidence_view(
            tmp_path, request, "structure-001", "pae", digest, {"structure-001-pae.npz": old_digest}
        )


def test_sample_downloads_share_the_same_fixed_source_guard_as_the_preview(tmp_path):
    from types import SimpleNamespace

    from opendde_workbench.prediction_sample_export import sample_zip

    request, _, output, result = native_task(tmp_path, declared=True)
    job = SimpleNamespace(id="fixture", request=request)
    original = (output / "result.json").read_bytes()
    changed = npz(pae=floating((3, 3), [0] * 9))
    (output / "structure-001-pae.npz").write_bytes(changed)
    old_hash = result["artifact_sha256"]["structure-001-pae.npz"]
    result["artifact_sha256"]["structure-001-pae.npz"] = hashlib.sha256(changed).hexdigest()
    (output / "result.json").write_text(json.dumps(result))
    with pytest.raises(ValueError, match="changed after"):
        sample_zip(
            tmp_path, job, "structure-001", {"result.json": hashlib.sha256(original).hexdigest()}
        )
    with pytest.raises(ValueError, match="disagree"):
        sample_zip(tmp_path, job, "structure-001", {"structure-001-pae.npz": old_hash})


@pytest.mark.parametrize("kind", ["wrong-shape", "nonfinite-hidden-cell", "wrong-plddt-units"])
def test_invalid_full_native_data_is_not_hidden_by_display_sampling(tmp_path, kind):
    request, digest, output, _ = native_task(tmp_path)
    folder = output / BOLTZ_OUTPUT
    name = "pae" if kind != "wrong-plddt-units" else "plddt"
    shape = (3, 3) if name == "pae" else (3,)
    values = [0] * 9 if name == "pae" else [0, 87, 1]
    if kind == "wrong-shape":
        shape = (1, 9)
    if kind == "nonfinite-hidden-cell":
        values[1] = float("nan")
    (folder / f"{name}_prediction_model_0.npz").write_bytes(npz(**{name: floating(shape, values)}))
    with pytest.raises(ValueError):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest, bins=1)


def test_unsupported_writer_wrong_task_or_missing_candidate_cannot_supply_confidence(tmp_path):
    request, digest, output, result = native_task(tmp_path)
    with pytest.raises(ValueError, match="differs"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", "f" * 64)
    with pytest.raises(FileNotFoundError):
        boltz_confidence_view(tmp_path, request, "missing", "pae", digest)
    result["version"] = "another-producer"
    (output / "result.json").write_text(json.dumps(result))
    with pytest.raises(ValueError, match="writer version"):
        boltz_confidence_view(tmp_path, request, "structure-001", "pae", digest)
    assert "boltz" not in NativeResult.model_validate(result).model_dump()


@pytest.mark.parametrize(
    "mutation", ["boolean-rank", "duplicate-rank", "other-sample-file", "missing-hash"]
)
def test_new_confidence_declarations_reject_ambiguous_or_unrecorded_sources(tmp_path, mutation):
    request, _, _, result = native_task(tmp_path, declared=True, samples=2)
    if mutation == "boolean-rank":
        result["boltz"]["samples"][0]["native_rank"] = False
    if mutation == "duplicate-rank":
        result["boltz"]["samples"][1]["native_rank"] = 0
    if mutation == "other-sample-file":
        result["boltz"]["samples"][0]["pae_artifact"] = "structure-002-pae.npz"
    if mutation == "missing-hash":
        del result["artifact_sha256"]["structure-001-pae.npz"]
    with pytest.raises(ValueError):
        validate_boltz_result(NativeResult.model_validate(result), request)


def test_confidence_contract_preserves_the_existing_ten_sample_limit(tmp_path):
    request, _, _, result = native_task(tmp_path, declared=True, samples=10)
    validate_boltz_result(NativeResult.model_validate(result), request)


def test_selected_and_whole_job_downloads_retain_declared_full_arrays(tmp_path):
    import io
    from types import SimpleNamespace
    from zipfile import ZipFile

    from opendde_workbench.prediction_archive import prediction_archive
    from opendde_workbench.prediction_sample_export import sample_zip

    request, digest, output, _ = native_task(tmp_path, declared=True, samples=2)
    job = SimpleNamespace(id="fixture", request=request)
    with ZipFile(io.BytesIO(sample_zip(tmp_path, job, "structure-002"))) as archive:
        receipt = json.loads(archive.read("sample.json"))
        for field in ("pae", "pde", "plddt"):
            record = receipt["files"][f"structure-002_{field}"]
            assert (
                archive.read(record["member"])
                == (output / f"structure-002-{field}.npz").read_bytes()
            )
        assert not any("structure-001" in name for name in archive.namelist())
    file, _ = prediction_archive(tmp_path, job, digest, {})
    with file, ZipFile(file) as archive:
        for index in (1, 2):
            for field in ("pae", "pde", "plddt"):
                name = f"structure-{index:03d}-{field}.npz"
                assert archive.read("outputs/" + name) == (output / name).read_bytes()
