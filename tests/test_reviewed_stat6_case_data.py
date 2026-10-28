"""Actual archived native results and cold restore; no scientific engines are executed."""

import hashlib
import json
import os
import zipfile
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.deployment.catalog import PACKAGES, dependencies
from opendde_workbench.examples import stat6_bundle_release as source
from opendde_workbench.examples.bundle import restore_bundle, verify_examples
from opendde_workbench.store import Store

NATIVE_EXAMPLES = {
    "predict": "716024e7-0a4a-4b9f-8962-fae4257bba48",
    "boltz.predict": "1190e938-51af-44a3-9dbc-4aacc77b5821",
    "epitope": "2d356d5b-b02d-4dea-be17-118234f9c62c",
    "esm": "081476d2-6fcf-4e17-b7c0-18576f848938",
    "esm2": "c689b556-3e00-4f94-a578-c631ef7717e4",
    "mpnn": "e9ccf58d-d7c9-41ec-ae8b-f952a4b9fd3d",
    "protrek-sequence": "39a51984-ac65-4a02-a164-7134cdc8beea",
    "protrek-structure": "757a1703-2cf4-4998-9891-f617a3f7715f",
    "import": "a7b7271b-39e6-40dc-84ac-94e8d76ddbf5",
    "features": "f71f9f99-a40b-41bc-a108-18afc4d6202a",
    "evolution": "92943087-2a75-412f-8124-d5805b9765c1",
    "compare": "5d23c69d-a17f-4ae1-95c6-970f8c46c9c8",
    "target-msa": "8f11132b-a1c8-4d60-b93f-2e1aab51eec3",
    "chemprop.predict": "1df43d87-9bf1-4a4e-9689-1935e516db9e",
}


def result_path(settings, identifier):
    return settings.state_dir / "jobs" / identifier / "output/result.json"


def check_complete_alignment_downloads(client, settings):
    identifier = NATIVE_EXAMPLES["target-msa"]
    path = result_path(settings, identifier)
    result = json.loads(path.read_text())
    assert result["complete"] and result["result"]["cached"]
    assert result["result"]["alignment_depth"] == 3245
    for row, expected_rows in zip(result["result"]["alignment_files"], (3245, 1), strict=True):
        response = client.get(f"/api/jobs/{identifier}/download", params={"name": row["artifact"]})
        assert response.status_code == 200
        assert response.content == path.with_name(row["artifact"]).read_bytes()
        assert hashlib.sha256(response.content).hexdigest() == row["sha256"]
        assert len(response.content) == row["bytes"]
        assert response.content.count(b">") == row["rows"] == expected_rows
        assert row["columns"] == 847


def check_exploratory_model_limits(settings):
    prediction = json.loads(result_path(settings, NATIVE_EXAMPLES["chemprop.predict"]).read_text())
    assert (
        prediction["complete"]
        and prediction["scope"] == "native_computation_not_experimental_measurement"
    )
    assert prediction["candidates"][0]["metrics"][0]["value"] == 6.8405423
    path = result_path(settings, NATIVE_EXAMPLES["chemprop.predict"]).with_name(
        "source-record-001.sdf"
    )
    assert hashlib.sha256(path.read_bytes()).hexdigest() == (
        "d1d34633711dec2c0da53add660dd47d766f25c807df5ad73465908686713e32"
    )
    training = json.loads(result_path(settings, "d90b04d5-f76d-44db-8762-78ff550dc1ec").read_text())
    metrics = {row["name"]: row["value"] for row in training["metrics"]}
    assert metrics["Test molecules"] == 16
    assert metrics["Test R²"] == pytest.approx(-0.19374784151046387)


def check_reviewed_pose_and_chemical_followup(client, settings):
    """Cold restore the real reviewed view and its exact computed descendant."""
    value = client.get("/api/examples/boltz.predict").json()
    pin = value["pin"]
    assert pin["initial_candidate_id"] == "structure-003"
    assert [row["job_id"] for row in pin["supporting_evidence"]] == [
        "a5773abd-8315-49f7-ab66-7df445c39d45"
    ]
    assert "regional pose hypothesis" in pin["review"]["limitations"]
    assert "3.77 Å" in pin["review"]["limitations"]
    identifier = NATIVE_EXAMPLES["boltz.predict"]
    primary = json.loads(result_path(settings, identifier).read_text())
    assert [row["id"] for row in primary["candidates"]] == [
        "structure-001",
        "structure-002",
        "structure-003",
    ]
    expected_sha = "dc4450f8f061bce82bfd3c69330da1af4d86b20f7bd8af46435e936d151d72cf"
    response = client.get(f"/api/jobs/{identifier}/download", params={"name": "structure-003.cif"})
    assert response.status_code == 200
    assert hashlib.sha256(response.content).hexdigest() == expected_sha
    followup = json.loads(result_path(settings, "a5773abd-8315-49f7-ab66-7df445c39d45").read_text())
    assert followup["program"] == "plip" and len(followup["interactions"]) == 3
    assert followup["artifact_sha256"]["interaction-structure.cif"] == expected_sha


def check_native_surface_sequence_examples(settings, store):
    """Read actual retained proposals and preserve their different scientific scores."""
    esm_job = store.get(NATIVE_EXAMPLES["esm2"])
    assert esm_job.request.payload["options"]["model_name"] == "facebook/esm2_t33_650M_UR50D"
    assert esm_job.request.payload["min_llr"] == 0
    esm = json.loads(result_path(settings, esm_job.id).read_text())["result"]["result"][
        "candidates"
    ]
    assert len(esm) == 4 and len({row["sequence"] for row in esm}) == 4
    assert [row["metadata"]["esm2_llr"] for row in esm] == [7.8242, 0.6367, 2.4539, 0.2051]
    mpnn_job = store.get(NATIVE_EXAMPLES["mpnn"])
    request = mpnn_job.request.payload
    assert request["num_sequences"] == 8 and request["parameters"]["temperature"] == 0.3
    parent = request["parent_chains"]["A"]
    assert len(parent) == 116
    proposals = json.loads(result_path(settings, mpnn_job.id).read_text())["result"]["candidates"]
    assert len(proposals) == len({row["sequence"] for row in proposals}) == 8
    for proposal in proposals:
        sequence = proposal["sequence"]
        assert len(sequence) == 116
        changed = {
            i for i, pair in enumerate(zip(parent, sequence, strict=True)) if pair[0] != pair[1]
        }
        assert changed and changed <= {32, 36, 63, 68, 93}
        assert all(sequence[i] not in "CP" for i in changed)
    assert proposals[4]["sequence"][68] == "K"  # Preserve the actual fifth sample.


def check_native_antibody_structure_search(client, settings, store):
    """Restore the real query and returned sequence without inventing hit coordinates."""
    identifier = NATIVE_EXAMPLES["protrek-structure"]
    job = store.get(identifier)
    assert job.request.payload == {
        "structure_path": "asset:5c2df31c-8ad4-4624-bb74-e8d3e4bb18ab",
        "chain": "A",
        "topk": 5,
    }
    native = json.loads(result_path(settings, identifier).read_text())
    assert native["complete"] and native["result"]["available"]
    assert native["structures"] == []
    text = native["result"]["result"]
    assert "**P01823** (score=32.816, length=113)" in text
    sequence = (
        "EVQLQESGPSLVKPSQTLSLTCSVTGDSITSDYWNWIRKFPGNKLEHMGYISYSGSTYYNPSLKSRISITR"
        "DTSKNQYYLQLNSVTSEDTATYYCTSLRFAYWGQGTLVTVSA"
    )
    assert sequence in text
    query = client.get("/api/assets/5c2df31c-8ad4-4624-bb74-e8d3e4bb18ab")
    assert query.status_code == 200
    assert hashlib.sha256(query.content).hexdigest() == (
        "a099acf214a36bcd9044b6f6ded303817be149b49be2c448c6b8d3c61ba68071"
    )
    value = client.get("/api/examples/protrek-structure").json()
    assert value["pin"]["job_id"] == identifier
    limits = value["pin"]["review"]["limitations"]
    assert "mouse reference" in limits and "no candidate coordinates" in limits
    replay = client.post(
        "/api/examples/protrek-structure/prepare",
        headers={
            "Origin": "http://127.0.0.1:4322",
            "X-Workbench-CSRF": client.get("/api/session").json()["csrf_token"],
        },
    )
    assert replay.status_code == 200
    assert replay.json()["request"]["payload"] == job.request.payload


def test_stat6_data_component_uses_the_existing_data_authority():
    package = PACKAGES["public-stat6-examples"]
    assert package.kind == "data" and package.version == source.VERSION == "32"
    assert package.url == source.URL and package.checksum == source.SHA256
    assert dependencies(package.id) == [package.id]
    assert len(source.CAPABILITIES) == len(set(source.CAPABILITIES)) == 58
    assert not set(source.CAPABILITIES) & {"openmm.dynamics", "gromacs.dynamics", "openfe.rbfe"}


def test_actual_stat6_archive_restores_complete_results_without_execution(settings):
    filename = os.environ.get("WB_REVIEWED_STAT6_ARCHIVE")
    if not filename:
        pytest.skip("The scoped delivery gate supplies the immutable reviewed STAT6 archive")
    archive = Path(filename)
    assert archive.stat().st_size == source.BYTES
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
    assert manifest["profile"] == "stat6"
    assert manifest["source_revision"] == source.SOURCE_REVISION
    assert manifest["capabilities"] == list(source.CAPABILITIES)
    app = create_app(replace(settings, allowed_origins=("http://127.0.0.1:4322",)))
    store = Store(settings.state_dir / "jobs.sqlite3")
    private = str(uuid4())
    with store.connect() as db:
        db.execute(
            "INSERT INTO projects VALUES(?,?,?,?)",
            (private, "Personal research", "Retain", "today"),
        )
    summary = {"modules": 58, "computed": 58, "validated": 0}
    assert restore_bundle(archive, settings, source.SHA256) == summary
    assert verify_examples(settings, source.CAPABILITIES, profile="stat6") == summary
    with TestClient(app, base_url="http://127.0.0.1:4322") as client:
        for capability, identifier in NATIVE_EXAMPLES.items():
            response = client.get("/api/examples/" + capability)
            assert response.status_code == 200
            value = response.json()
            assert value["computed_result_available"]
            assert value["pin"]["job_id"] == identifier
            assert value["pin"]["review"]["scope"] == "reviewed_computational_example"
            assert store.get(identifier).status == "succeeded"
        check_complete_alignment_downloads(client, settings)
        check_exploratory_model_limits(settings)
        check_reviewed_pose_and_chemical_followup(client, settings)
        check_native_surface_sequence_examples(settings, store)
        check_native_antibody_structure_search(client, settings, store)
        job = store.get(NATIVE_EXAMPLES["predict"])
        assert len(job.request.components) == 1
        assert len(job.request.components[0].value) == 116
        response = client.post(
            "/api/examples/predict/prepare",
            headers={
                "Origin": "http://127.0.0.1:4322",
                "X-Workbench-CSRF": client.get("/api/session").json()["csrf_token"],
            },
        )
        assert response.status_code == 200
        prepared = response.json()
        with store.connect() as db:
            original_request = db.execute(
                "SELECT request FROM jobs WHERE id=?", (job.id,)
            ).fetchone()[0]
        assert prepared["request"] == json.loads(original_request)
        assert "protein sequence" in prepared["study"]["guide"]["steps"][0][1]
        alignment = prepared["objects"]["prediction_msa"]
        assert alignment["reference"]["asset_id"] == str(job.request.components[0].unpaired_msa)
    tables = ("jobs", "assets", "example_pins", "example_record_pins", "scientific_objects")
    with store.connect() as db:
        before = {
            table: [tuple(row) for row in db.execute("SELECT * FROM " + table)] for table in tables
        }
        assert not db.execute(
            "SELECT id FROM jobs WHERE status IN ('queued','running','cancelling')"
        ).fetchall()
        assert (
            db.execute("SELECT description FROM projects WHERE id=?", (private,)).fetchone()[0]
            == "Retain"
        )
    assert restore_bundle(archive, settings, source.SHA256) == summary
    with store.connect() as db:
        assert before == {
            table: [tuple(row) for row in db.execute("SELECT * FROM " + table)] for table in tables
        }


def test_stat6_pose_review_distinguishes_unassessed_native_flags(settings):
    filename = os.environ.get("WB_REVIEWED_STAT6_ARCHIVE")
    if not filename:
        pytest.skip("The scoped delivery gate supplies the reviewed STAT6 archive")
    app = create_app(replace(settings, allowed_origins=("http://127.0.0.1:4322",)))
    restore_bundle(Path(filename), settings, source.SHA256)
    with TestClient(app, base_url="http://127.0.0.1:4322") as client:
        pose = client.get("/api/examples/pose_exploration").json()
        assert pose["module"]["revision"] == 4
        assert pose["record_pin"]["record_sha256"] == (
            "5b761f8b6615e33ed72a86fe5945a1d784ea7249d090693fd4bd0041bc808d70"
        )
        review = pose["record_pin"]["review"]["interpretation"]
        assert "15 PoseBusters checks" in review
        assert "six water/cofactor checks were unassessed" in review
        assert "pass 22 native PoseBusters" not in review
        for identifier in (
            "8969b071-879b-4374-9044-f9108ba29588",
            "ca498efb-cb18-40ca-9262-c2597ab422da",
            "448af5fb-2957-4f08-b3c9-3fbd5f84a9d1",
        ):
            result = json.loads(result_path(settings, identifier).read_text())
            assert len(result["checks"]) == 22
            assert all(check["outcome"] == "pass" for check in result["checks"])
            metrics = result["metrics"]
            assert metrics["number_double_bonds_checked"] == 0
            for kind in ("organic_cofactors", "inorganic_cofactors", "waters"):
                assert "smallest_distance_" + kind not in metrics
                assert "volume_overlap_" + kind not in metrics
