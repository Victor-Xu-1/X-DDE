"""Real SQLite and same-origin API; unfinished drafts never create jobs or files."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import httpx2 as httpx
import pytest
from pydantic import ValidationError

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.drafts.models import DraftInput
from opendde_workbench.drafts.storage import DraftStore
from opendde_workbench.store import CapacityError, ConflictError, Store


def snapshot(**changes):
    value = {
        "tool": "mol1.predict",
        "schema_version": 1,
        "revision": 0,
        "state": {
            "name": "STAT6 unfinished setup",
            "components": [
                {"kind": "protein", "value": ">P42226\nMSLWGLVSKMPPEK", "count": 1},
                {"kind": "ligand", "value": "", "count": 0},
            ],
            "settings": {"kind": "mol1", "samples": 0},
            "bonds": [],
            "advanced": True,
            "seed_text": "101,,unfinished,",
            "device": "cuda",
            "memory": 0,
            "seed": -1,
        },
    }
    value.update(changes)
    return DraftInput.model_validate(value)


@pytest.fixture
def storage(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    return DraftStore(store), assets


def test_incomplete_round_trip_restart_update_and_safe_retry(storage):
    drafts, assets = storage
    identifier = str(uuid4())
    original = snapshot()
    saved = drafts.save(identifier, original)
    assert saved.state.seed_text == "101,,unfinished,"
    assert saved.state.components[1].value == "" and saved.state.seed == -1
    assert DraftStore(assets.store).get(identifier) == saved
    assert drafts.save(identifier, original) == saved  # Lost-response retry, same id/body.
    edited = original.model_copy(deep=True)
    edited.revision = 1
    edited.state.name = "STAT6 follow-up"
    updated = drafts.save(identifier, edited)
    assert updated.revision == 2 and updated.created_at == saved.created_at
    assert drafts.list()[0].name == "STAT6 follow-up"
    assert not hasattr(drafts.list()[0], "state")
    with pytest.raises(ConflictError, match="changed elsewhere"):
        drafts.save(identifier, original)
    with assets.store.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM assets").fetchone()[0] == 0


def test_concurrent_edits_admit_one_revision_without_lost_updates(storage):
    drafts, _ = storage
    identifier = str(uuid4())
    drafts.save(identifier, snapshot())

    def edit(index):
        change = snapshot(revision=1)
        change.state.name = str(index)
        try:
            return drafts.save(identifier, change).revision
        except ConflictError:
            return "conflict"

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(edit, [1, 2]), key=str) == [2, "conflict"]
    assert drafts.get(identifier).revision == 2


def test_capacity_archive_restore_and_stale_revision(storage):
    drafts, _ = storage
    saved = [drafts.save(str(uuid4()), snapshot()) for _ in range(30)]
    with pytest.raises(CapacityError):
        drafts.save(str(uuid4()), snapshot())
    archived = drafts.archive(saved[0].id, 1, True)
    assert archived.archived and archived.revision == 2
    assert len(drafts.list()) == 29 and drafts.list(True)[0].id == saved[0].id
    assert drafts.list(True, 30) == []
    with pytest.raises(ConflictError):
        drafts.archive(saved[0].id, 1, False)
    with pytest.raises(ConflictError, match="archived"):
        drafts.save(saved[0].id, snapshot(revision=2))
    drafts.save(str(uuid4()), snapshot())
    with pytest.raises(CapacityError):
        drafts.archive(saved[0].id, 2, False)
    drafts.archive(saved[1].id, 1, True)
    restored = drafts.archive(saved[0].id, 2, False)
    assert not restored.archived and restored.revision == 3


def test_source_files_retained_including_archived_drafts(storage):
    drafts, assets = storage
    source = b">public STAT6 fragment\nMSLWGLVSKMPPEK\n"
    asset = assets.save("stat6.fasta", "sequences", source)
    value = snapshot()
    value.state.components[0].source_sequence = UUID(asset.id)
    saved = drafts.save(str(uuid4()), value)
    assert saved.state.components[0].source_sequence == UUID(asset.id)
    for archive in [False, True]:
        if archive:
            drafts.archive(saved.id, saved.revision, True)
        with pytest.raises(ValueError, match="saved prediction draft"):
            assets.delete_unused(UUID(asset.id))
        assert assets.path(asset).read_bytes() == source
    value.state.components[0].source_sequence = uuid4()
    with pytest.raises(ValueError, match="no longer available"):
        drafts.save(str(uuid4()), value)


@pytest.mark.parametrize(
    "change",
    [
        {"schema_version": 2},
        {"tool": "unknown"},
        {"revision": -1},
    ],
)
def test_unknown_envelope_rejected(change):
    with pytest.raises(ValidationError):
        snapshot(**change)


def test_snapshot_bounds_and_lossless_seed_field():
    base = snapshot().model_dump(mode="json")
    for state in [
        {**base["state"], "name": "x" * 81},
        {**base["state"], "components": base["state"]["components"] * 17},
        {**base["state"], "settings": {"additional_seeds": [None]}},
        {**base["state"], "settings": {"samples": float("inf")}},
        {**base["state"], "seed": float("nan")},
        {**base["state"], "components": [{"kind": "protein", "count": 1, "value": "A" * 50001}]},
        {
            **base["state"],
            "settings": {"x": "X" * 50000, "y": "Y" * 50000, "z": "Z" * 50000},
            "components": [{"kind": "protein", "count": 1, "value": "A" * 50000}],
        },
    ]:
        with pytest.raises(ValidationError):
            DraftInput.model_validate({**base, "state": state})


def test_api_csrf_validation_persistence_and_no_job_admission(settings):
    app = create_app(settings)

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://localhost"
        ) as client:
            identifier = str(uuid4())
            url = "/api/prediction-drafts/" + identifier
            body = snapshot().model_dump(mode="json")
            assert (await client.put(url, json=body)).status_code == 403
            csrf = (await client.get("/api/session")).json()["csrf_token"]
            client.headers["X-Workbench-CSRF"] = csrf
            assert (await client.put(url, json={**body, "schema_version": 2})).status_code == 422
            saved = await client.put(url, json=body)
            assert saved.status_code == 200 and saved.json()["revision"] == 1
            assert (await client.get(url)).json() == saved.json()
            assert (await client.get("/api/prediction-drafts")).json()[0]["id"] == identifier
            changed = snapshot().model_dump(mode="json")
            changed["state"]["name"] = "Changed"
            assert (await client.put(url, json=changed)).status_code == 409
            assert (await client.get("/api/prediction-drafts?offset=-1")).status_code == 422
            assert (await client.get("/api/prediction-drafts/" + str(uuid4()))).status_code == 404
            assert (
                await client.post(url + "/archive", json={"revision": 1, "archived": True})
            ).status_code == 200
            assert (await client.get("/api/prediction-drafts")).json() == []
            assert len((await client.get("/api/prediction-drafts?archived=true")).json()) == 1
            assert (await client.get("/api/jobs")).json() == []
            assert (await client.get("/api/assets")).json() == []

    asyncio.run(scenario())
