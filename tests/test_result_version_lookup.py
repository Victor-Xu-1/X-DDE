"""Exact saved-record lookup in real SQLite; no inference or native calculation."""

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.assets import AssetStore
from opendde_workbench.requests import Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.routes import register_research
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


@pytest.fixture
def scientific(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    return ScientificStore(store, AssetStore(store, tmp_path / "assets"))


def fixture_versions(scientific):
    job = scientific.store.create(
        Properties(name="Metadata fixture", smiles=["c1ccccc1"]), str(uuid4()), 1000, 2000
    )
    asset = scientific.assets.save("Exact %_ file.sdf", "ligand", b"metadata fixture\n$$$$\n" * 2)
    target = scientific.create(
        VersionInput(
            asset_id=asset.id, kind="molecule", label="A renamed saved material", record=1
        ),
        uuid4(),
        source_job=job.id,
    )
    with scientific.store.connect() as db:
        db.execute(
            "UPDATE scientific_objects SET created_at='2020-01-01' WHERE id=?", (str(target.id),)
        )
        db.executemany(
            "INSERT INTO scientific_objects VALUES(?,?,?,?,?,?)",
            [
                (
                    str(identifier),
                    str(target.family_id),
                    asset.id,
                    target.model_copy(
                        update={
                            "id": identifier,
                            "reference": target.reference.model_copy(
                                update={"version_id": identifier, "record": 0}
                            ),
                            "label": f"Metadata-only version {index}",
                        }
                    ).model_dump_json(),
                    "metadata-only-fixture",
                    "2026-10-11",
                )
                for index in range(1100)
                for identifier in [uuid4()]
            ],
        )
    return job, asset, target


def test_exact_original_record_is_found_beyond_a_thousand_newer_versions(scientific):
    job, asset, target = fixture_versions(scientific)
    assert target not in scientific.list(200, source_job=job.id)
    assert scientific.list(
        1, source_job=job.id, asset_name=asset.name, sha256=asset.sha256, kind="molecule", record=1
    ) == [target]
    assert scientific.list(1, source_job=job.id, asset_name="' OR 1=1 --", record=1) == []
    assert (
        scientific.list(1, source_job=job.id, asset_name=asset.name, sha256="0" * 64, record=1)
        == []
    )
    assert scientific.list(1, source_job=uuid4(), asset_name=asset.name, record=1) == []
    assert (
        scientific.list(1, source_job=job.id, asset_name=asset.name, kind="structure", record=1)
        == []
    )
    assert scientific.assets.path(asset).read_bytes() == b"metadata fixture\n$$$$\n" * 2


def test_existing_route_filters_before_paging_and_preserves_plain_listing(scientific):
    job, asset, target = fixture_versions(scientific)
    app = FastAPI()
    register_research(app, scientific.store, scientific.assets, lambda: None)
    params = {
        "source_job": job.id,
        "asset_name": asset.name,
        "sha256": asset.sha256,
        "kind": "molecule",
        "record": 1,
        "limit": 1,
    }
    with TestClient(app) as client:
        response = client.get("/api/research/objects", params=params)
        assert response.status_code == 200
        assert response.json() == [target.model_dump(mode="json")]
        assert len(client.get("/api/research/objects", params={"source_job": job.id}).json()) == 100
        for field, value in [
            ("record", -1),
            ("record", 500),
            ("sha256", "invalid"),
            ("kind", "anything"),
            ("limit", 201),
            ("asset_name", "x" * 181),
        ]:
            assert (
                client.get("/api/research/objects", params={**params, field: value}).status_code
                == 422
            )


def test_same_name_other_bytes_or_record_cannot_replace_the_original(scientific):
    job, asset, target = fixture_versions(scientific)
    changed = scientific.assets.save(
        asset.name, "ligand", b"different metadata fixture\n$$$$\n" * 2
    )
    scientific.create(
        VersionInput(asset_id=changed.id, kind="molecule", label=target.label, record=1),
        uuid4(),
        source_job=job.id,
    )
    assert scientific.list(
        1, source_job=job.id, asset_name=asset.name, sha256=asset.sha256, kind="molecule", record=1
    ) == [target]
