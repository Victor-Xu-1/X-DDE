"""Lossless OpenDDE editor recovery through the shared SQLite and API authority."""

import asyncio
from uuid import UUID, uuid4

import httpx2 as httpx
import pytest
from pydantic import ValidationError
from test_boltz_drafts import snapshot as boltz_snapshot
from test_prediction_drafts import snapshot as mol1_snapshot

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.drafts.models import DraftInput
from opendde_workbench.drafts.opendde import ENUMS, FLAGS, NUMBERS
from opendde_workbench.drafts.storage import DraftStore
from opendde_workbench.parameters import Parameters
from opendde_workbench.store import CapacityError, ConflictError, Store


def snapshot(**changes):
    body = {
        "tool": "predict",
        "schema_version": 1,
        "revision": 0,
        "state": {
            "name": "STAT6 unfinished OpenDDE",
            "kind": "complex",
            "components": [{"kind": "protein", "value": ">P42226\nMSLWGLVSKMPPEK", "count": 0}],
            "workflows": {"ligand": [{"kind": "ligand", "value": "", "count": 1}]},
            "parameters": {
                "seed": 4294967295,
                "samples": 0,
                "steps": 200,
                "cycles": 10,
                "dtype": "bf16",
                "additional_seeds": [2],
            },
            "expert": True,
            "bonds": [],
            "input_references": [],
            "integer_text": {"additional_seeds": "2，unfinished,", "gpu_ids": "0, not yet"},
        },
    }
    body.update(changes)
    return DraftInput.model_validate(body)


@pytest.fixture
def storage(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    return DraftStore(store), AssetStore(store, tmp_path / "assets")


def test_round_trip_restart_safe_retry_and_revision_conflict(storage):
    drafts, assets = storage
    original, identifier = snapshot(), str(uuid4())
    saved = drafts.save(identifier, original)
    assert saved.state.model_dump() == original.state.model_dump()
    assert "model" not in saved.state.parameters
    assert drafts.save(identifier, original) == saved
    assert DraftStore(assets.store).get(identifier) == saved
    edit = snapshot(revision=1)
    edit.state.name = "Updated STAT6"
    updated = drafts.save(identifier, edit)
    assert updated.revision == 2 and updated.state.name == "Updated STAT6"
    with pytest.raises(ConflictError):
        drafts.save(identifier, original)
    with assets.store.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0


def test_three_models_keep_separate_lists_and_immutable_model_identity(storage):
    drafts, _ = storage
    rows = [
        drafts.save(str(uuid4()), value)
        for value in [snapshot(), mol1_snapshot(), boltz_snapshot()]
    ]
    for row in rows:
        assert [item.id for item in drafts.list(tool=row.tool)] == [row.id]
    for other in [mol1_snapshot(), boltz_snapshot()]:
        other.revision = rows[0].revision
        with pytest.raises(ConflictError, match="prediction model"):
            drafts.save(rows[0].id, other)
    assert drafts.get(rows[0].id) == rows[0]


def test_hidden_workflows_and_exact_source_versions_protect_archived_assets(storage):
    drafts, assets = storage
    source = assets.save("public-stat6.a3m", "msa", b">STAT6\nMSLWGLVSKMPPEK\n")
    ligand = assets.save("study.sdf", "ligand", b"Original identity test fixture")
    value = snapshot()
    value.state.workflows["ligand"][0].ligand_file = UUID(ligand.id)
    value.state.components[0].paired_msa = UUID(source.id)
    reference = {
        "asset_id": ligand.id,
        "sha256": ligand.sha256,
        "record": 3,
        "conformer": 1,
        "version_id": str(uuid4()),
    }
    body = value.model_dump(mode="json")
    body["state"]["input_references"] = [reference]
    saved = drafts.save(str(uuid4()), DraftInput.model_validate(body))
    assert saved.state.input_references[0].model_dump(mode="json") == reference
    for archived in [False, True]:
        if archived:
            drafts.archive(saved.id, saved.revision, True, "predict")
        for asset in [source, ligand]:
            with pytest.raises(ValueError, match="saved prediction draft"):
                assets.delete_unused(UUID(asset.id))
    value.state.workflows["ligand"][0].ligand_file = uuid4()
    with pytest.raises(ValueError, match="no longer available"):
        drafts.save(str(uuid4()), value)


def test_shared_capacity_and_archive_recovery(storage):
    drafts, _ = storage
    rows = [drafts.save(str(uuid4()), snapshot()) for _ in range(30)]
    with pytest.raises(CapacityError):
        drafts.save(str(uuid4()), boltz_snapshot())
    archived = drafts.archive(rows[0].id, 1, True, "predict")
    assert len(drafts.list(tool="predict")) == 29
    restored = drafts.archive(archived.id, archived.revision, False, "predict")
    assert restored.revision == 3 and not restored.archived


@pytest.mark.parametrize(
    "patch",
    [
        {"verified": True},
        {"kind": "unknown"},
        {"workflows": {"unknown": []}},
        {"integer_text": {"gpu_ids": "x" * 1001}},
        {
            "parameters": {
                "seed": 1,
                "samples": 1,
                "steps": 20,
                "cycles": 1,
                "dtype": "bf16",
                "readiness": True,
            }
        },
        {
            "parameters": {
                "seed": float("inf"),
                "samples": 1,
                "steps": 20,
                "cycles": 1,
                "dtype": "bf16",
            }
        },
        {"components": [{"kind": "protein", "count": 1, "value": "A" * 50001}]},
        {"workflows": {"ligand": [{"kind": "ligand", "value": "C" * 50000, "count": 1}] * 5}},
    ],
)
def test_unbounded_or_invented_fields_are_rejected(patch):
    body = snapshot().model_dump(mode="json")
    body["state"].update(patch)
    with pytest.raises(ValidationError):
        DraftInput.model_validate(body)


def test_native_parameter_contract_does_not_silently_omit_new_fields():
    assert set(Parameters.model_fields) == NUMBERS | FLAGS | ENUMS.keys() | {
        "additional_seeds",
        "gpu_ids",
        "checkpoint_id",
    }


def test_api_requires_correct_model_and_csrf_without_task_admission(settings):
    app = create_app(settings)

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://localhost"
        ) as client:
            route = "/api/prediction-drafts/" + str(uuid4())
            body = snapshot().model_dump(mode="json")
            assert (await client.put(route + "?tool=predict", json=body)).status_code == 403
            token = (await client.get("/api/session")).json()["csrf_token"]
            client.headers["X-Workbench-CSRF"] = token
            assert (await client.put(route, json=body)).status_code == 422
            saved = await client.put(route + "?tool=predict", json=body)
            assert saved.status_code == 200
            assert (await client.get(route)).status_code == 404
            assert (await client.get(route + "?tool=predict")).json() == saved.json()
            assert len((await client.get("/api/prediction-drafts?tool=predict")).json()) == 1
            assert (await client.get("/api/jobs")).json() == []

    asyncio.run(scenario())
