"""Exact alignment query/keys, immutable references and unchanged legacy tasks."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.alignment_files import checked_alignment, read_alignment, write_alignment
from opendde_workbench.assets import AssetStore
from opendde_workbench.integrations.bindings import validate_bindings
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def reference(asset=None):
    return {
        "asset_id": asset.id if asset else str(uuid4()),
        "sha256": asset.sha256 if asset else "a" * 64,
    }


def task(components, inputs=()):
    return {
        "operation": "boltz_predict",
        "name": "Protein complex with exact MSA",
        "payload": {"kind": "boltz", "components": components},
        "inputs": list(inputs),
        "scientific_inputs": [item["source"] for item in inputs],
        "options": {"device": "cuda"},
    }


def test_provided_alignments_bind_each_chain_once_and_leave_old_request_bytes_unchanged():
    legacy = IntegratedTask.model_validate(task([{"id": "A", "kind": "protein", "value": "ACD"}]))
    assert "msa" not in legacy.model_dump()["payload"]["components"][0]
    assert "msa_mode" not in legacy.model_dump()["payload"]["components"][0]
    first, second = reference(), reference()
    components = [
        {"id": "A", "kind": "protein", "value": "ACD", "msa": first},
        {"id": "B", "kind": "protein", "value": "MKT", "msa": second},
    ]
    value = task(components, [{"role": "msa", "source": first}, {"role": "msa", "source": second}])
    request = IntegratedTask.model_validate(value)
    assert len(request.inputs) == 2
    value["inputs"].append(value["inputs"][0])
    value["scientific_inputs"].append(first)
    with pytest.raises(ValidationError, match="once"):
        IntegratedTask.model_validate(value)


def test_identical_chains_share_one_exact_alignment_and_no_other_molecular_kind_accepts_it():
    msa = reference()
    components = [
        {"id": name, "kind": "protein", "value": "ACD", "msa": msa} for name in ["A", "B"]
    ]
    inputs = [{"role": "msa", "source": msa}]
    assert len(IntegratedTask.model_validate(task(components, inputs)).inputs) == 1
    components[1]["msa"] = None
    with pytest.raises(ValidationError, match="Identical protein"):
        IntegratedTask.model_validate(task(components, inputs))
    with pytest.raises(ValidationError, match="protein alignment"):
        IntegratedTask.model_validate(
            task([{"id": "A", "kind": "ligand", "value": "CCO", "msa": msa}], inputs)
        )


@pytest.mark.parametrize("mode,has_msa", [("single", True), ("provided", False)])
def test_explicit_msa_modes_cannot_silently_fall_back(mode, has_msa):
    msa = reference()
    component = {"id": "A", "kind": "protein", "value": "ACDE", "msa_mode": mode}
    inputs = []
    if has_msa:
        component["msa"] = msa
        inputs = [{"role": "msa", "source": msa}]
    with pytest.raises(ValidationError, match="explicitly choose single-sequence"):
        IntegratedTask.model_validate(task([component], inputs))


def test_a3m_wrapping_insertions_and_pairing_csv_preserve_native_alignment_rows(tmp_path):
    text = "# colabfold metadata\n>query\nAC\nDE\n>homolog\nACa-E\n"
    rows = checked_alignment(text, ".a3m", "ACDE")
    path = tmp_path / "transport.a3m"
    write_alignment(rows, path)
    assert path.read_text() == ">query\nACDE\n>homolog\nACa-E\n"
    assert read_alignment(path, "ACDE") == rows
    paired = "sequence,key\nACDE,0\nACa-E,42\nA--E,-1\nAC-E,-1\n"
    pairs = checked_alignment(paired, ".csv", "ACDE")
    target = tmp_path / "paired.csv"
    write_alignment(pairs, target)
    assert read_alignment(target, "ACDE") == pairs


@pytest.mark.parametrize(
    "text,suffix,query",
    [
        (">q\nACDE\n>bad\nACE\n", ".a3m", "ACDE"),
        (">q\nACDE\n", ".a3m", "ACDF"),
        (">q\nACdDE\n", ".a3m", "ACDE"),
        (">q\nACD.\n", ".a3m", "ACDE"),
        (">q\n", ".a3m", "ACDE"),
        ("key,sequence,endpoint\n0,ACDE,http://elsewhere\n", ".csv", "ACDE"),
        ("key,sequence\n4,ACDE\n4,AC-E\n", ".csv", "ACDE"),
        ("key,sequence\n1.5,ACDE\n", ".csv", "ACDE"),
        ("key,sequence\n0,ACDE,extra\n", ".csv", "ACDE"),
    ],
)
def test_invalid_or_wrong_query_alignments_are_rejected_without_repair(text, suffix, query):
    with pytest.raises(ValueError):
        checked_alignment(text, suffix, query)


def test_file_kind_query_hash_and_scientific_version_are_checked_before_native_admission(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    original = b">q\nACDE\n>homolog\nAC-E\n"
    asset = assets.save("query.a3m", "msa", original)
    scientific = ScientificStore(store, assets)
    version = scientific.create(
        VersionInput(asset_id=asset.id, kind="alignment", label="Exact query MSA"), uuid4()
    )
    ref = version.reference.model_dump(mode="json")
    value = task(
        [{"id": "A", "kind": "protein", "value": "ACDE", "msa": ref}],
        [{"role": "msa", "source": ref}],
    )
    request = IntegratedTask.model_validate(value)
    assert validate_bindings(request, assets) == {asset.id: asset}
    value["payload"]["components"][0]["value"] = "ACDF"
    with pytest.raises(ValueError, match="query differs"):
        validate_bindings(IntegratedTask.model_validate(value), assets)
    assets.path(asset).write_bytes(original.replace(b"ACDE", b"ACDF"))
    with pytest.raises(ValueError, match="bytes differ|reference"):
        validate_bindings(request, assets)


def test_alignment_csv_upload_does_not_widen_other_prediction_engines(tmp_path):
    from opendde_workbench.prediction import Prediction

    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    asset = assets.save("paired.csv", "msa", b"key,sequence\n0,ACDE\n4,AC-E\n")
    prediction = Prediction.model_validate(
        {
            "name": "Protein",
            "components": [
                {
                    "kind": "protein",
                    "value": "ACDE",
                    "count": 1,
                    "chain_ids": ["A"],
                    "unpaired_msa": asset.id,
                }
            ],
            "parameters": {"feature_mode": "uploaded"},
        }
    )
    with pytest.raises(ValueError, match="A3M"):
        assets.validate_bindings(prediction)


def test_msa_query_check_is_a_readonly_csrf_protected_native_input_review(client_factory):
    with client_factory() as client:
        upload = client.post(
            "/api/assets?kind=msa&name=protein.a3m", content=b">q\nACDE\n>h\nAC-E\n"
        )
        assert upload.status_code == 201, upload.text
        asset = upload.json()
        value = {"reference": reference(SimpleNamespace(**asset)), "sequence": "ACDE"}
        before = client.get("/api/jobs").json()
        response = client.post("/api/scientific/boltz/msa-check", json=value)
        assert response.status_code == 200, response.text
        assert response.json() == {
            "name": "protein.a3m",
            "rows": 2,
            "unique_sequences": 2,
            "columns": 4,
        }
        assert client.get("/api/jobs").json() == before
        value["sequence"] = "ACDF"
        assert client.post("/api/scientific/boltz/msa-check", json=value).status_code == 422
        client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/scientific/boltz/msa-check", json=value).status_code == 403


def test_native_a3m_outputs_keep_task_lineage_in_the_existing_scientific_store(client_factory):
    from conftest import ProcessEngine, wait_status
    from test_jobs import submit

    script = (
        "from pathlib import Path; Path('output/query.a3m').write_text('>q\\nACDE\\n>h\\nAC-E\\n')"
    )
    with client_factory(ProcessEngine(script)) as client:
        job = submit(client).json()
        wait_status(client, job["id"], {"succeeded"})
        versions = client.get("/api/research/objects").json()
        assert len(versions) == 1
        obj = versions[0]
        assert obj["kind"] == "alignment" and obj["source_job"] == job["id"]
        before = obj["reference"]
        assert client.post(f"/api/jobs/{job['id']}/index-assets").json()["state"] == "complete"
        assert client.get("/api/research/objects").json() == versions
        assert client.get(f"/api/assets/{before['asset_id']}").content == b">q\nACDE\n>h\nAC-E\n"
        response = client.post(
            "/api/scientific/boltz/msa-check", json={"reference": before, "sequence": "ACDE"}
        )
        assert response.status_code == 200, response.text
        assert response.json()["rows"] == 2


def test_only_boltz_snapshots_add_the_alignment_transport_files(settings):
    from opendde_workbench.integrations.backend import ScientificBackend

    backend = ScientificBackend(settings, "boltz")
    assert backend.shared_sources["native_alignment_files.py"].name == "alignment_files.py"
    assert backend.shared_sources["native_boltz_inputs.py"].is_file()
    assert len(backend.files) == len(set(backend.files))
    assert "native_boltz_inputs.py" not in ScientificBackend(settings, "plip").shared_sources
