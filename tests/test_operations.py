"""Behavioral coverage for utility tasks, uploads and atomic batches; run on the server/CI."""

import json
from uuid import UUID, uuid4

import pytest
from conftest import ProcessEngine, wait_status
from test_jobs import submit

from opendde_workbench.assets import AssetStore
from opendde_workbench.models import Prediction
from opendde_workbench.native_arguments import native_arguments, needs_gpu, network_enabled
from opendde_workbench.requests import TASK_ADAPTER, Properties
from opendde_workbench.store import CapacityError, ConflictError, Store


def test_batch_failure_rolls_back_every_job_and_retry_is_idempotent(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    tasks = [
        Prediction(name=str(i), components=[{"kind": "ligand", "value": "CCO"}]) for i in range(3)
    ]
    key = uuid4()
    with pytest.raises(CapacityError):
        store.create_batch(tasks, key, 2, 50)
    assert store.list_jobs() == []
    created = store.create_batch(tasks, key, 3, 50)
    assert [j.id for j in store.create_batch(tasks, key, 3, 50)] == [j.id for j in created]
    with pytest.raises(ConflictError):
        store.create_batch(tasks[:2], key, 3, 50)


def test_asset_integrity_deletion_and_submission_share_real_sqlite(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    asset = assets.save("../input.sdf", "ligand", b"molecule\n$$$$\n")
    assert asset.name == "input.sdf"
    assert assets.save("input.sdf", "ligand", b"molecule\n$$$$\n").id == asset.id
    request = Properties(name="library", ligand_files=[asset.id])
    store.create(request, str(uuid4()), 20, 500)
    with pytest.raises(ValueError, match="referenced"):
        assets.delete_unused(UUID(asset.id))
    assets.path(asset).write_bytes(b"corrupted-content")
    with pytest.raises(ValueError, match="size changed"):
        assets.snapshot(request, tmp_path / "job")


def test_removed_asset_cannot_enter_queue(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    AssetStore(store, tmp_path / "assets")
    with pytest.raises(ConflictError, match="removed"):
        store.create(Properties(name="missing", ligand_files=[uuid4()]), str(uuid4()), 20, 500)


def test_raw_upload_and_download_do_not_accept_arbitrary_host_paths(client_factory):
    with client_factory() as client:
        result = client.post(
            "/api/assets?kind=msa&name=query.a3m",
            content=b">query\nACDE\n",
            headers={"Content-Type": "application/octet-stream"},
        )
        assert result.status_code == 201
        identifier = result.json()["id"]
        assert client.get(f"/api/assets/{identifier}").content == b">query\nACDE\n"
        assert (
            client.post(
                "/api/assets?kind=structure&name=unsafe.py", content=b"not a structure"
            ).status_code
            == 422
        )
        assert (
            client.delete(
                f"/api/assets/{identifier}", headers={"X-Workbench-CSRF": "wrong"}
            ).status_code
            == 403
        )
        assert client.delete(f"/api/assets/{identifier}").status_code == 200
        assert client.get(f"/api/assets/{identifier}").status_code == 404


def test_property_task_succeeds_without_any_structure_and_analysis_rejects_it(client_factory):
    script = (
        "from pathlib import Path; import json; "
        "r=json.loads(Path('request.json').read_text()); "
        "Path('output/result.json').write_text(json.dumps("
        "{'operation':r['operation'],'complete':True,'molecules':[]}))"
    )
    with client_factory(ProcessEngine(script)) as client:
        created = submit(
            client, {"operation": "properties", "name": "protocol only", "smiles": ["CCO"]}
        )
        assert created.status_code == 201
        job = wait_status(client, created.json()["id"], {"succeeded"})
        assert client.get(f"/api/jobs/{job['id']}/result").json()["operation"] == "properties"
        assert client.get(f"/api/jobs/{job['id']}/analysis").status_code == 409


def test_wrong_operation_manifest_does_not_count_as_success(client_factory):
    script = (
        "from pathlib import Path; Path('output/result.json').write_text("
        '\'{"operation":"inspect","complete":true}\')'
    )
    with client_factory(ProcessEngine(script)) as client:
        created = submit(
            client, {"operation": "properties", "name": "wrong manifest", "smiles": ["CCO"]}
        )
        wait_status(client, created.json()["id"], {"failed"})


def test_cpu_guidance_multiseed_and_distributed_native_dispatch():
    base = {
        "name": "contract",
        "components": [{"kind": "protein", "value": "ACDE"}, {"kind": "ligand", "value": "CCO"}],
    }
    request = Prediction.model_validate(
        {
            **base,
            "parameters": {
                "device": "cpu",
                "dtype": "fp32",
                "tfg": True,
                "additional_seeds": [102],
            },
        }
    )
    args = native_arguments(request)
    assert args[args.index("--seeds") + 1] == "101,102"
    assert args[args.index("--use_tfg_guidance") + 1] == "true"
    assert not needs_gpu(request) and not network_enabled(request)
    parallel = Prediction.model_validate(
        {**base, "parameters": {"gpu_ids": [1, 2], "distributed": True}}
    )
    assert native_arguments(parallel)[:4] == [
        "torchrun",
        "--standalone",
        "--nproc_per_node=2",
        "--module",
    ]


def test_legacy_and_every_operation_decode_without_starting_runtime():
    legacy = {"name": "legacy", "components": [{"kind": "ligand", "value": "CCO"}]}
    assert TASK_ADAPTER.validate_python(legacy).operation == "predict"
    for operation in ("msa", "mt", "prep"):
        req = TASK_ADAPTER.validate_python(
            {
                "operation": operation,
                "name": "features",
                "components": [
                    {"kind": "protein", "value": "ACDE"},
                    {"kind": "rna", "value": "ACGU"},
                ],
                "parameters": {
                    "feature_mode": "search",
                    "allow_network": True,
                    "use_template": operation != "msa",
                    "use_rna_msa": operation == "prep",
                },
            }
        )
        assert native_arguments(req) == ["python", "/adapter/native_task.py"]
    assert (
        json.loads(
            TASK_ADAPTER.validate_python(
                {"operation": "doctor", "name": "diagnostic"}
            ).model_dump_json()
        )["operation"]
        == "doctor"
    )
