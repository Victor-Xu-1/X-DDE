"""Real ASGI downloads preserve exact selected scientific coordinates and properties."""

from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from rdkit import Chem

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.store import Store

INPUTS = Path(__file__).resolve().parents[1] / "src/opendde_workbench/examples/stat6/inputs"


@pytest.fixture
def downloads(settings):
    app = create_app(settings)
    assets = AssetStore(Store(settings.state_dir / "jobs.sqlite3"), settings.state_dir / "assets")
    return TestClient(app, base_url="http://127.0.0.1:4320"), assets


@pytest.mark.parametrize("record", [0, 1])
@pytest.mark.parametrize("newline", [b"\n", b"\r\n"])
def test_actual_stat6_record_download_preserves_identity_coordinates_and_source(
    downloads, record, newline
):
    client, assets = downloads
    originals = [
        (INPUTS / name).read_bytes().replace(b"\r\n", b"\n").replace(b"\n", newline)
        for name in ("STAT6-user-warhead.sdf", "STAT6-user-PROTAC.sdf")
    ]
    raw = b"".join(originals)
    asset = assets.save("STAT6 study.sdf", "ligand", raw)
    route = "/api/assets/" + asset.id
    response = client.get(route, params={"record": record})
    assert response.status_code == 200
    assert response.headers["X-Structure-Record"] == str(record)
    assert response.headers["X-Structure-Format"] == "sdf"
    assert f"record-{record + 1}.sdf" in response.headers["content-disposition"]
    supplier = list(Chem.ForwardSDMolSupplier(BytesIO(response.content), removeHs=False))
    original = list(Chem.ForwardSDMolSupplier(BytesIO(originals[record]), removeHs=False))[0]
    assert len(supplier) == 1 and supplier[0] is not None
    assert Chem.MolToSmiles(supplier[0]) == Chem.MolToSmiles(original)
    assert np.array_equal(
        supplier[0].GetConformer().GetPositions(), original.GetConformer().GetPositions()
    )
    assert supplier[0].GetPropsAsDict() == original.GetPropsAsDict()
    assert assets.path(asset).read_bytes() == raw == client.get(route).content


@pytest.mark.parametrize("record", [-1, 2, 500])
def test_record_bounds_fail_without_returning_a_different_record(downloads, record):
    client, assets = downloads
    raw = (INPUTS / "STAT6-user-warhead.sdf").read_bytes()
    asset = assets.save("source.sdf", "ligand", raw)
    assert client.get("/api/assets/" + asset.id, params={"record": record}).status_code == 422


def test_a_single_record_and_mol_keep_original_bytes(downloads):
    client, assets = downloads
    raw = (INPUTS / "STAT6-user-warhead.sdf").read_bytes()
    for name, data in (("one.sdf", raw), ("one.mol", raw.split(b"$$$$")[0])):
        asset = assets.save(name, "ligand", data)
        response = client.get("/api/assets/" + asset.id, params={"record": 0})
        assert response.status_code == 200 and response.content == data
        assert client.get("/api/assets/" + asset.id, params={"record": 1}).status_code == 422


def test_corrupt_same_length_bytes_are_not_published_as_the_selected_pose(downloads):
    client, assets = downloads
    raw = (INPUTS / "STAT6-user-warhead.sdf").read_bytes()
    asset = assets.save("source.sdf", "ligand", raw)
    assets.path(asset).write_bytes(b"x" + raw[1:])
    response = client.get("/api/assets/" + asset.id, params={"record": 0})
    assert response.status_code == 422 and "changed" in response.json()["detail"]


def test_wrong_format_missing_asset_and_empty_records_are_explicit(downloads):
    client, assets = downloads
    wrong = assets.save("receptor.pdb", "structure", b"END\n")
    assert client.get("/api/assets/" + wrong.id, params={"record": 0}).status_code == 422
    assert (
        client.get("/api/assets/00000000-0000-4000-8000-000000000001?record=0").status_code == 404
    )
    asset = assets.save(
        "empty-first.sdf", "ligand", b"$$$$\n" + (INPUTS / "STAT6-user-warhead.sdf").read_bytes()
    )
    assert client.get("/api/assets/" + asset.id, params={"record": 0}).status_code == 422
    assert client.get("/api/assets/" + asset.id, params={"record": 1}).status_code == 200
