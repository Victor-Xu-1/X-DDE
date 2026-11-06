"""Real NumPy interchange, typed native API and exports, with no engine or model."""

import hashlib
import io
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.boltz_confidence import boltz_confidence_view
from opendde_workbench.boltz_confidence_sources import PROCESSED
from opendde_workbench.native_arrays import floats, read_array
from opendde_workbench.science_routes import register_science
from server_tests.boltz_confidence_case import (
    IDENTITIES,
    LINKS,
    SCORES,
    compressed,
    native_case,
    processed_structure,
)


@pytest.mark.parametrize("declared", [False, True])
@pytest.mark.parametrize("metric", ["pae", "pde"])
def test_numpy_writer_mask_modified_polymer_ligand_ion_rna_and_units(tmp_path, declared, metric):
    store, job, _, sources, digest = native_case(tmp_path, declared=declared)
    root = tmp_path / "jobs" / job.id
    data = boltz_confidence_view(root, job.request, "structure-001", metric, digest, bins=2)
    with np.load(io.BytesIO(sources[metric]), allow_pickle=False) as native:
        assert data["matrix"] == native[metric][np.ix_([0, 3], [0, 3])].tolist()
    binding = data["binding"]
    assert binding["native_atom_identity"] == IDENTITIES
    assert binding["atom_to_token_idx"] == LINKS
    assert binding["token_asym_id"] == [1, 1, 2, 2, 3, 4]
    assert binding["atom_plddt"] == SCORES[LINKS].tolist()
    assert data["mapping_status"] == "available"
    assert len(store.list_jobs()) == 1


def test_unsupported_mapping_preserves_valid_matrix_with_explicit_unlinked_state(tmp_path):
    _, job, _, _, digest = native_case(tmp_path, declared=False)
    root = tmp_path / "jobs" / job.id
    tables = processed_structure()
    tables["residues"]["atom_idx"][2] = 0
    (root / "output" / PROCESSED).write_bytes(compressed(**tables))
    data = boltz_confidence_view(root, job.request, "structure-001", "pae", digest)
    assert data["matrix"][0][1] == 0.5
    assert data["binding"] is None and data["mapping_status"] == "unsupported"


def test_native_route_uses_original_request_and_never_calls_analysis_or_changes_files(tmp_path):
    store, job, _, sources, _ = native_case(tmp_path, declared=True)
    output = tmp_path / "jobs" / job.id / "output"
    before = {
        p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in output.rglob("*")
        if p.is_file()
    }
    app = FastAPI()
    register_science(app, store, object(), SimpleNamespace(state_dir=tmp_path))
    endpoint = f"/api/jobs/{job.id}/confidence?candidate=structure-001"
    with TestClient(app) as client:
        response = client.get(endpoint + "&metric=pae")
        assert response.status_code == 200
        transfer = client.get(
            endpoint + "&download=true&source_sha256=" + response.json()["native_sha256"]
        )
        assert transfer.status_code == 200 and transfer.content == sources["pae"]
        assert client.get(endpoint + "&download=true&source_sha256=" + "f" * 64).status_code == 409
        assert client.get(endpoint + "&download=true").status_code == 422
        assert client.get(endpoint + "&metric=pde").json()["matrix"][0][1] == 3
        assert client.get(endpoint + "&metric=contacts").status_code == 422
        assert client.get(endpoint.replace("structure-001", "missing")).status_code == 404
        (output / "structure-001-pae.npz").write_bytes(b"changed source")
        response = client.get(endpoint)
        assert response.status_code == 422 and "could not be verified" in response.json()["detail"]
        (output / "structure-001-pae.npz").write_bytes(sources["pae"])
        assert client.get(endpoint).status_code == 200
    assert before == {
        p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in output.rglob("*")
        if p.is_file()
    }
    assert len(store.list_jobs()) == 1


def test_native_reader_rejects_overlapping_work_and_releases_its_slot(tmp_path, monkeypatch):
    import opendde_workbench.science_routes as routes

    store, job, _, _, _ = native_case(tmp_path, declared=True)
    started, release = Event(), Event()
    original = routes.boltz_confidence_view

    def held(*args, **kwargs):
        started.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(routes, "boltz_confidence_view", held)
    app = FastAPI()
    register_science(app, store, object(), SimpleNamespace(state_dir=tmp_path))
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as workers:
        endpoint = f"/api/jobs/{job.id}/confidence?candidate=structure-001"
        first = workers.submit(client.get, endpoint)
        try:
            assert started.wait(5)
            assert client.get(endpoint).status_code == 429
        finally:
            release.set()
        assert first.result(timeout=10).status_code == 200
        assert client.get(endpoint).status_code == 200


@pytest.mark.parametrize("dtype", ["<f4", ">f4", "<f8", ">f8"])
@pytest.mark.parametrize("order", ["C", "F"])
def test_numeric_reader_agrees_with_real_numpy(dtype, order):
    matrix = np.array([[0, 1, 2], [3, 4, 5]], dtype=dtype, order=order)
    source = compressed(pae=matrix)
    at = floats(read_array(source, "pae"))
    assert [[at(i, j) for j in range(3)] for i in range(2)] == matrix.tolist()
