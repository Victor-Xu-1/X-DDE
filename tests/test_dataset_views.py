"""Real upload/pagination/column mapping trust boundaries, not scientific inference."""

import hashlib
from uuid import uuid4


def upload(client, content, kind="counts", name="counts.csv"):
    key = str(uuid4())
    response = client.post(
        "/api/assets/uploads",
        json={"name": name, "kind": kind, "size": len(content)},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    response = client.put(
        f"/api/assets/uploads/{key}?offset=0",
        content=content,
        headers={"X-Chunk-SHA256": hashlib.sha256(content).hexdigest()},
    )
    assert response.status_code == 200, response.text
    response = client.post(f"/api/assets/uploads/{key}/complete")
    assert response.status_code == 200, response.text
    return response.json()


def test_actual_column_preview_with_unicode_quotes_and_bounded_rows(client_factory):
    with client_factory() as client:
        content = b'compound_id,SMILES,selected,control\n"candidate,1",Cc1ccc(O)cc1,92,3\n'
        asset = upload(client, content)
        response = client.get(f"/api/datasets/files/{asset['id']}/preview")
        assert response.status_code == 200, response.text
        preview = response.json()
        assert preview["columns"] == ["compound_id", "SMILES", "selected", "control"]
        assert preview["rows"][0]["compound_id"] == "candidate,1"
        assert client.get(f"/api/datasets/{uuid4()}/table?view=unknown").status_code == 422
        assert client.get("/api/datasets/results?role=unreviewed").status_code == 422


def test_preview_rejects_long_and_duplicate_headers_instead_of_mapping_truncated_columns(
    client_factory,
):
    with client_factory() as client:
        for raw in (b"ID,ID\na,b\n", b"ID,SMILES\nmember," + b"C" * 70000 + b"\n"):
            asset = upload(client, raw)
            assert client.get(f"/api/datasets/files/{asset['id']}/preview").status_code == 422
        assert client.get(f"/api/datasets/{uuid4()}/members").status_code == 404


def test_supplier_directory_all_connections_are_real_file_adapters_not_invented_inventory(
    client_factory,
):
    with client_factory() as client:
        suppliers = client.get("/api/datasets/suppliers").json()
        assert len(suppliers) == 35 and len({row["id"] for row in suppliers}) == 35
        assert all("sdf" in row["formats"] and "csv" in row["formats"] for row in suppliers)
        assert not any("installed" in row or "stock" in row or "total" in row for row in suppliers)
