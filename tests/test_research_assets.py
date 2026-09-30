"""Real SQLite, immutable files, CSRF and persisted task lineage; no chemical inference."""

from uuid import uuid4

from conftest import ProcessEngine, wait_status
from test_jobs import submit


def upload(client, name="molecule.sdf", kind="ligand"):
    response = client.post(
        f"/api/assets?kind={kind}&name={name}",
        content=b"molecular file\n$$$$\n",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 201
    return response.json()


def version(client, asset, *, parent=None, key=None, label="candidate"):
    body = {"asset_id": asset["id"], "kind": "molecule", "label": label, "parent_id": parent}
    return client.post(
        "/api/research/objects", json=body, headers={"Idempotency-Key": key or str(uuid4())}
    )


def test_version_family_integrity_idempotency_and_restart(client_factory):
    with client_factory() as client:
        asset = upload(client)
        key = str(uuid4())
        created = version(client, asset, key=key)
        assert created.status_code == 201
        original = created.json()
        assert original["validation"] == "file_integrity_only"
        assert original["reference"]["sha256"] == asset["sha256"]
        assert version(client, asset, key=key).json() == original
        assert version(client, asset, key=key, label="different").status_code == 409
        edited = version(client, asset, parent=original["id"], label="edited").json()
        assert edited["family_id"] == original["family_id"]
        assert edited["parent_id"] == original["id"]
        assert edited["reference"]["version_id"] != original["reference"]["version_id"]
        assert client.delete(f"/api/assets/{asset['id']}").status_code == 409
        graph = client.get("/api/research/graph").json()
        assert {
            "source": "object:" + original["id"],
            "target": "object:" + edited["id"],
            "relation": "derived_from",
        } in graph["edges"]
        assert client.get(f"/api/assets/{asset['id']}").content == b"molecular file\n$$$$\n"
    with client_factory() as client:
        assert client.get(f"/api/research/objects/{edited['id']}").json() == edited
        assert len(client.get("/api/research/objects").json()) == 2


def test_versions_reject_wrong_file_kind_missing_parent_and_cross_origin(client_factory):
    with client_factory() as client:
        asset = upload(client, "protein.pdb", "structure")
        assert version(client, asset).status_code == 422
        molecule = upload(client)
        assert version(client, molecule, parent=str(uuid4())).status_code == 422
        assert (
            client.post(
                "/api/research/objects",
                json={"asset_id": molecule["id"], "kind": "molecule", "label": "x"},
                headers={"Idempotency-Key": str(uuid4()), "Origin": "https://example.com"},
            ).status_code
            == 403
        )
        assert client.get("/api/research/graph?focus=object:missing").status_code == 404


def test_property_handoff_preserves_exact_version_and_rejects_forgery(client_factory):
    script = (
        "from pathlib import Path; import json; "
        "Path('output/result.json').write_text(json.dumps("
        "{'operation':'properties','complete':True,'molecules':[]}))"
    )
    with client_factory(ProcessEngine(script)) as client:
        asset = upload(client)
        obj = version(client, asset).json()
        request = {
            "operation": "properties",
            "name": "from saved version",
            "ligand_files": [asset["id"]],
            "scientific_inputs": [obj["reference"]],
        }
        job = submit(client, request).json()
        assert wait_status(client, job["id"], {"succeeded"})["request"]["scientific_inputs"] == [
            obj["reference"]
        ]
        graph = client.get("/api/research/graph").json()
        assert {
            "source": "object:" + obj["id"],
            "target": "task:" + job["id"],
            "relation": "used_as_input",
        } in graph["edges"]
        request["scientific_inputs"][0] = {**obj["reference"], "sha256": "a" * 64}
        assert submit(client, request).status_code == 422
        request["scientific_inputs"][0] = {**obj["reference"], "version_id": str(uuid4())}
        assert submit(client, request).status_code == 422


def test_preserving_result_registers_source_task_in_same_asset_authority(client_factory):
    with client_factory() as client:
        job = submit(client).json()
        wait_status(client, job["id"], {"succeeded"})
        assert client.get("/api/research/objects").json()[0]["source_job"] == job["id"]
        response = client.post(f"/api/jobs/{job['id']}/assets?kind=structure&name=result.cif")
        assert response.status_code == 201
        obj = client.get("/api/research/objects").json()[0]
        assert obj["source_job"] == job["id"]
        assert obj["reference"]["asset_id"] == response.json()["id"]
        assert (
            client.post(f"/api/jobs/{job['id']}/assets?kind=structure&name=result.cif").json()
            == response.json()
        )
        assert len(client.get("/api/research/objects").json()) == 1
        assert client.post(f"/api/jobs/{job['id']}/index-assets").json()["state"] == "complete"
        assert len(client.get("/api/research/objects").json()) == 1


def test_output_indexing_keeps_partial_failure_visible_and_can_retry(client_factory):
    script = (
        "from pathlib import Path; import json; "
        "Path('output/library.sdf').write_text('first\\n$$$$\\nsecond\\n$$$$\\n'); "
        "Path('output/broken.fasta').write_text('not a FASTA'); "
        "Path('output/result.json').write_text(json.dumps("
        "{'operation':'properties','complete':True,'molecules':[]}))"
    )
    with client_factory(ProcessEngine(script)) as client:
        job = submit(
            client, {"operation": "properties", "name": "outputs", "smiles": ["CCO"]}
        ).json()
        wait_status(client, job["id"], {"succeeded"})
        index = client.get("/api/research/indexing").json()[0]
        assert index["state"] == "partial"
        assert index["errors"][0]["artifact"] == "broken.fasta"
        molecules = [
            obj for obj in client.get("/api/research/objects").json() if obj["kind"] == "molecule"
        ]
        assert {obj["reference"]["record"] for obj in molecules} == {0, 1}
        count = len(client.get("/api/research/objects").json())
        assert client.post(f"/api/jobs/{job['id']}/index-assets").json()["state"] == "partial"
        assert len(client.get("/api/research/objects").json()) == count


def test_graph_follows_older_ancestors_and_focuses_outside_recent_page(client_factory):
    with client_factory() as client:
        asset = upload(client)
        first = version(client, asset, label="first").json()
        second = version(client, asset, parent=first["id"], label="second").json()
        third = version(client, asset, parent=second["id"], label="third").json()
        graph = client.get("/api/research/graph?limit=1").json()
        assert graph["truncated"]
        assert {"object:" + obj["id"] for obj in [first, second, third]} <= {
            node["id"] for node in graph["nodes"]
        }
        assert len(graph["edges"]) == len(
            {(edge["source"], edge["target"], edge["relation"]) for edge in graph["edges"]}
        )
        focused = client.get(
            "/api/research/graph", params={"limit": 1, "focus": "object:" + first["id"]}
        ).json()
        assert "object:" + second["id"] in {node["id"] for node in focused["nodes"]}
        assert client.get("/api/research/graph?focus=object:invalid").status_code == 404
