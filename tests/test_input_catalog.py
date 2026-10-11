"""Real SQLite/catalogue boundaries; metadata fixtures never become research results."""

import hashlib
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.assets import AssetStore
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.input_catalog import input_page, register_input_catalog
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


@pytest.fixture
def scientific(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    return ScientificStore(store, AssetStore(store, tmp_path / "assets"))


def test_search_paging_passes_the_old_window_without_loading_every_asset(scientific):
    assets = scientific.assets
    original = assets.save(
        "Original STAT6 %_ receptor.pdb", "structure", b"catalogue transport fixture"
    )
    with scientific.store.connect() as db:
        db.execute("UPDATE assets SET created_at='2020-01-01T00:00:00Z' WHERE id=?", (original.id,))
        db.executemany(
            "INSERT INTO assets VALUES(?,?,?,?,?,?,?)",
            [
                (
                    str(uuid4()),
                    f"Metadata-only input {i:05}.pdb",
                    "structure",
                    ".pdb",
                    10,
                    "a" * 64,
                    f"2026-10-10T12:{i // 60:03}:{i % 60:02}",
                )
                for i in range(10050)
            ],
        )
    first = input_page(scientific, "structure", [".pdb"], limit=25)
    assert first.total == 10051 and len(first.items) == 25
    assert original.id not in {item.asset.id for item in first.items}
    assert (
        input_page(scientific, "structure", [".pdb"], offset=10050).items[0].asset.id == original.id
    )
    result = input_page(scientific, "structure", [".pdb"], query="%_")
    assert [item.asset.id for item in result.items] == [original.id]
    assert not input_page(scientific, "structure", [".pdb"], query="' OR 1=1 --").items
    assert len(input_page(scientific, "structure", [".pdb"], offset=10025).items) == 25
    assert hashlib.sha256(assets.path(original).read_bytes()).hexdigest() == original.sha256


def test_file_collection_and_saved_record_keep_distinct_exact_identity(scientific):
    source = scientific.assets.save("Library.sdf", "ligand", b"transport record\n$$$$\n" * 2)
    version = scientific.create(
        VersionInput(asset_id=source.id, kind="molecule", label="Saved record", record=1), uuid4()
    )
    both = input_page(scientific, "ligand", [".sdf"])
    assert both.total == 2
    record = next(item for item in both.items if item.origin == "saved")
    file = next(item for item in both.items if item.origin == "upload")
    assert record.reference == version.reference
    assert record.reference.record == 1 and record.version == version
    assert file.reference.record == 0 and file.reference.version_id is None
    assert input_page(scientific, "ligand", [".sdf"], scope="files").total == 1
    selected = input_page(
        scientific, "ligand", [".sdf"], query="unmatched", selected="version:" + str(version.id)
    )
    assert (
        selected.total == 0
        and selected.items == []
        and selected.selected.reference == version.reference
    )


def test_actual_catalogue_route_filters_kind_format_and_validates_requests(scientific):
    file = scientific.assets.save("STAT6-library.sdf", "ligand", b"metadata-only\n$$$$\n")
    scientific.assets.save("Unrelated.pdb", "structure", b"metadata-only")
    app = FastAPI()
    register_input_catalog(app, scientific)
    with TestClient(app) as client:
        result = client.get("/api/research/input-catalog?kind=ligand&formats=.sdf").json()
        assert result["total"] == 1 and result["items"][0]["asset"]["id"] == file.id
        for extra in (
            "&formats=.json",
            "&limit=51",
            "&offset=-1",
            "&selected=file:bad",
            "&scope=unknown",
            "&q=" + "x" * 181,
        ):
            assert (
                client.get(
                    "/api/research/input-catalog?kind=ligand&formats=.sdf" + extra
                ).status_code
                == 422
            )
        assert not scientific.store.list_jobs()
