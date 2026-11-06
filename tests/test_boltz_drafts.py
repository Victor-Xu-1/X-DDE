"""Editor recovery through real SQLite and API; never scientific task admission."""

import asyncio
from uuid import UUID, uuid4

import httpx2 as httpx
import pytest
from pydantic import ValidationError
from test_prediction_drafts import snapshot as mol1_snapshot

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.drafts.models import DraftInput
from opendde_workbench.drafts.storage import DraftStore
from opendde_workbench.store import ConflictError, Store


def snapshot(**changes):
    value = {
        "tool": "boltz.predict",
        "schema_version": 1,
        "revision": 0,
        "state": {
            "name": "STAT6 unfinished complex",
            "components": [
                {
                    "id": "STAT6",
                    "kind": "protein",
                    "value": ">P42226\nMSLWGLVSKMPPEK",
                    "msa_mode": "provided",
                },
                {"id": "B", "kind": "ligand", "value": ""},
            ],
            "settings": {
                "kind": "boltz",
                "samples": 0,
                "recycling_steps": -1,
                "sampling_steps": 200,
                "affinity": True,
            },
            "options": {"device": "cuda", "cpu": 0, "memory_mib": 0, "seed": -1},
            "expert": True,
        },
    }
    value.update(changes)
    return DraftInput.model_validate(value)


@pytest.fixture
def storage(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    return DraftStore(store), AssetStore(store, tmp_path / "assets")


def test_unfinished_boltz_round_trip_restart_and_lost_response_retry(storage):
    drafts, assets = storage
    identifier = str(uuid4())
    original = snapshot()
    saved = drafts.save(identifier, original)
    assert saved.state.model_dump() == original.state.model_dump()
    assert drafts.save(identifier, original) == saved
    assert DraftStore(assets.store).get(identifier) == saved
    edited = snapshot(revision=1)
    edited.state.components = []
    edited.state.name = ""
    updated = drafts.save(identifier, edited)
    assert updated.state.components == [] and updated.state.name == ""
    assert updated.revision == 2
    with pytest.raises(ConflictError):
        drafts.save(identifier, original)
    with assets.store.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0


def test_tool_filter_precedes_pagination_and_engine_identity_is_immutable(storage):
    drafts, _ = storage
    mol1 = drafts.save(str(uuid4()), mol1_snapshot())
    boltz = [drafts.save(str(uuid4()), snapshot()) for _ in range(29)]
    assert [row.id for row in drafts.list()] == [mol1.id]
    assert len(drafts.list(tool="boltz.predict")) == 29
    assert drafts.list(offset=30, tool="boltz.predict") == []
    for previous, replacement in [(mol1, snapshot()), (boltz[0], mol1_snapshot())]:
        replacement.revision = previous.revision
        with pytest.raises(ConflictError, match="prediction model"):
            drafts.save(previous.id, replacement)
        assert drafts.get(previous.id) == previous
    with pytest.raises(ConflictError, match="another prediction model"):
        drafts.archive(boltz[0].id, 1, True, "mol1.predict")


def test_nested_source_and_msa_references_remain_protected_after_archive(storage):
    drafts, assets = storage
    ligand = assets.save("retained.sdf", "ligand", b"original retained molecule bytes")
    msa = assets.save("stat6.a3m", "msa", b">STAT6\nMSLWGLVSKMPPEK\n")
    original = snapshot().model_dump(mode="json")
    for component, role, asset in [(1, "source", ligand), (0, "msa", msa)]:
        original["state"]["components"][component][role] = {
            "asset_id": asset.id,
            "sha256": asset.sha256,
            "record": 2 if role == "source" else 0,
            "conformer": 0,
            "version_id": str(uuid4()),
        }
    value = DraftInput.model_validate(original)
    saved = drafts.save(str(uuid4()), value)
    assert saved.state.components[1].source.record == 2
    assert saved.state.components[0].msa.sha256 == msa.sha256
    for archived in (False, True):
        if archived:
            drafts.archive(saved.id, saved.revision, True, "boltz.predict")
        for asset in (ligand, msa):
            with pytest.raises(ValueError, match="saved prediction draft"):
                assets.delete_unused(UUID(asset.id))
    value.state.components[0].msa.asset_id = uuid4()
    with pytest.raises(ValueError, match="no longer available"):
        drafts.save(str(uuid4()), value)


@pytest.mark.parametrize(
    "change",
    [
        {"tool": "mol1.predict"},
        {"schema_version": 2},
        {"settings": {"kind": "boltz", "samples": float("inf")}},
        {"components": [{"id": "A", "kind": "protein", "value": "A" * 50001}]},
        {"verified": True},
    ],
)
def test_boltz_drafts_reject_wrong_envelope_unbounded_or_invented_readiness(change):
    body = snapshot().model_dump(mode="json")
    if "tool" in change or "schema_version" in change:
        body.update(change)
    else:
        body["state"].update(change)
    with pytest.raises(ValidationError):
        DraftInput.model_validate(body)


def test_api_tool_boundaries_and_legacy_default_without_job_admission(settings):
    app = create_app(settings)

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://localhost"
        ) as client:
            identifier = str(uuid4())
            route = "/api/prediction-drafts/" + identifier
            body = snapshot().model_dump(mode="json")
            csrf = (await client.get("/api/session")).json()["csrf_token"]
            client.headers["X-Workbench-CSRF"] = csrf
            assert (await client.put(route, json=body)).status_code == 422
            saved = await client.put(route + "?tool=boltz.predict", json=body)
            assert saved.status_code == 200
            assert (await client.get(route)).status_code == 404
            assert (await client.get(route + "?tool=boltz.predict")).json() == saved.json()
            assert (await client.get("/api/prediction-drafts")).json() == []
            assert len((await client.get("/api/prediction-drafts?tool=boltz.predict")).json()) == 1
            assert (
                await client.post(route + "/archive", json={"revision": 1, "archived": True})
            ).status_code == 409
            archive = await client.post(
                route + "/archive?tool=boltz.predict", json={"revision": 1, "archived": True}
            )
            assert archive.status_code == 200
            assert (await client.get("/api/prediction-drafts?tool=boltz.predict")).json() == []
            assert (
                len(
                    (
                        await client.get("/api/prediction-drafts?tool=boltz.predict&archived=true")
                    ).json()
                )
                == 1
            )
            assert (await client.get("/api/jobs")).json() == []

    asyncio.run(scenario())
