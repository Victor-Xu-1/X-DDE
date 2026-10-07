"""Exercise the real platform API/CSRF and persisted record without a scientific model."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WB_AUTO_DEPLOY", "0")
    settings = Settings(
        state_dir=tmp_path,
        image_file=tmp_path / "missing-image",
        code_file=tmp_path / "missing-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        yield client


def headers(client, key=None):
    return {
        "X-Workbench-CSRF": client.get("/api/session").json()["csrf_token"],
        "Idempotency-Key": str(key or uuid4()),
    }


def test_preview_import_export_and_refresh_are_real(client):
    raw = b"compound_id,value,relation\nA,10,=\nA,50,>\n"
    response = client.post(
        "/api/assets?name=experimental.csv&kind=measurements",
        content=raw,
        headers={**headers(client), "Content-Type": "application/octet-stream"},
    )
    # Use the same multipart-free upload protocol as the production frontend.
    assert response.status_code == 201, response.text
    asset = response.json()
    columns = client.get("/api/research/evidence/inputs/" + asset["id"]).json()
    assert columns["columns"] == ["compound_id", "value", "relation"]
    body = {
        "name": "Reported assay",
        "source": {"asset_id": asset["id"], "sha256": asset["sha256"]},
        "conditions": {"target": "target-A", "assay": "assay-A"},
        "columns": {"relation": "relation"},
        "endpoint": "IC50",
        "unit": "nM",
        "citation": "Controlled API fixture",
    }
    assert client.post("/api/research/evidence", json=body).status_code == 403
    preview = client.post("/api/research/evidence/preview", json=body, headers=headers(client))
    assert preview.status_code == 200 and preview.json()["total"] == 2
    key = uuid4()
    created = client.post("/api/research/evidence", json=body, headers=headers(client, key))
    assert created.status_code == 201, created.text
    result = created.json()
    assert client.get("/api/research/evidence/" + result["id"]).json() == result
    repeated = client.post("/api/research/evidence", json=body, headers=headers(client, key))
    assert (
        repeated.json()["id"] == result["id"]
        and len(client.get("/api/research/evidence").json()) == 1
    )
    assert client.get("/api/research/evidence/" + result["id"] + "/download").status_code == 200
    assert client.get("/api/jobs").json() == []
    assert client.delete("/api/assets/" + asset["id"], headers=headers(client)).status_code in {
        409,
        422,
    }
