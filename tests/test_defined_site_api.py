"""Real retained STAT6 alignment, files, SQLite and API; no inference is dispatched."""

import hashlib
import os
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle_restore import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.research.receptor_sets import ReceptorSets
from opendde_workbench.store import Store

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_DEFINED_SITE_ARCHIVE"),
    reason="Select the retained native-data API gate.",
)
ALIGNMENT = "90df5f6d-75e8-4990-a696-e06b43b6a7f2"


@pytest.fixture
def retained_alignment(settings):
    archive = Path(os.environ["WB_DEFINED_SITE_ARCHIVE"])
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    restore_bundle(archive, settings, SHA256)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    job = store.get(ALIGNMENT)
    assert job.status == "succeeded" and job.request.operation == "receptor_ensemble"
    indexed = OutputCatalog(store, assets).index(
        job, settings.state_dir / "jobs" / job.id / "output"
    )
    assert indexed["state"] == "complete", indexed
    ensemble = next(v for v in ReceptorSets(store, assets).list() if str(v.source_job) == ALIGNMENT)
    transform = ensemble.members[0].evidence.transformation
    assert ensemble.options.reference_index == 0
    assert all(abs(v) < 1e-12 for v in transform.translation)
    assert all(
        abs(v - int(i == j)) < 1e-12
        for i, row in enumerate(transform.rotation)
        for j, v in enumerate(row)
    )
    assert all(m.reference and m.evidence.quality.backbone_complete for m in ensemble.members)
    return ensemble, store, assets


def create_reference(client):
    file = Path(__file__).parent / "fixtures/stat6/9big-ak1690.sdf"
    assert (
        hashlib.sha256(file.read_bytes()).hexdigest()
        == "edae02152fd2b053d5bdfce9a2ca573c463bdc813c0a433e9659a816948fc868"
    )
    asset = client.post(
        "/api/assets?kind=ligand&name=9BIG-AK1690-A701.sdf",
        content=file.read_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert asset.status_code == 201, asset.text
    version = client.post(
        "/api/research/objects",
        json={
            "kind": "molecule",
            "asset_id": asset.json()["id"],
            "label": "Public deposited AK-1690 reference",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert version.status_code == 201, version.text
    return version.json()["reference"]


def site_input(ensemble, ligand):
    return {
        "kind": "defined_regions",
        "name": "STAT6 retained reference and explicit region conditions",
        "ensemble_id": str(ensemble.id),
        "regions": [
            {
                "label": "9BIG / deposited AK-1690 reference",
                "member_index": 0,
                "search": {
                    "kind": "reference_ligand",
                    "frame": ensemble.members[0].reference.model_dump(mode="json"),
                    "reference": ligand,
                    "coordinate_basis": "user_confirmed",
                },
            },
            {
                "label": "Explicit aligned control region",
                "member_index": 1,
                "search": {
                    "kind": "box",
                    "frame": ensemble.members[1].reference.model_dump(mode="json"),
                    "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
                },
            },
        ],
    }


def test_retained_native_sites_plan_graph_csrf_idempotency_and_restart(
    retained_alignment,
    client_factory,
):
    ensemble, _, _ = retained_alignment
    with client_factory() as client:
        baseline_jobs = client.get("/api/jobs").json()
        ligand = create_reference(client)
        body = site_input(ensemble, ligand)
        key = str(uuid4())
        denied = client.post(
            "/api/research/site-sets",
            json=body,
            headers={"Idempotency-Key": key, "X-Workbench-CSRF": "invalid"},
        )
        assert denied.status_code == 403
        saved = client.post("/api/research/site-sets", json=body, headers={"Idempotency-Key": key})
        assert saved.status_code == 201, saved.text
        sites = saved.json()
        assert sites["schema_version"] == 2 and len(sites["sites"]) == 2
        assert "observations" not in sites and "groups" not in sites
        assert (
            client.post(
                "/api/research/site-sets", json=body, headers={"Idempotency-Key": key}
            ).json()
            == sites
        )
        assert (
            client.post(
                "/api/research/site-sets",
                json={**body, "name": "Changed"},
                headers={"Idempotency-Key": key},
            ).status_code
            == 409
        )
        response = client.post(
            "/api/research/pose-explorations",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "site_set_id": sites["id"],
                "site_ids": [s["id"] for s in sites["sites"]],
                "ligands": [{"reference": ligand}],
            },
        )
        assert response.status_code == 201, response.text
        exploration = response.json()
        assert all(
            c["source_kind"] == "defined_search" and "pocket_rank" not in c
            for c in exploration["combinations"]
        )
        plan = client.get("/api/workflows/plans/" + exploration["plan_id"]).json()
        assert len(plan["body"]["steps"]) == 2
        for step, saved_site, region in zip(
            plan["body"]["steps"], sites["sites"], body["regions"], strict=True
        ):
            search = step["request"]["search"]
            assert search == saved_site["search"]
            assert search["kind"] == region["search"]["kind"]
            assert search["frame"] == region["search"]["frame"]
            if search["kind"] == "box":
                assert search["box"]["unit"] == "angstrom"
                assert search["box"]["center"] == region["search"]["box"]["center"]
                assert search["box"]["size"] == region["search"]["box"]["size"]
            else:
                assert search["reference"] == region["search"]["reference"]
                assert search["coordinate_basis"] == "user_confirmed"
        graph = client.get("/api/research/graph?focus=site_set:" + sites["id"])
        assert graph.status_code == 200, graph.text
        assert any(e["relation"] == "defined_search_input" for e in graph.json()["edges"])
        assert not any(e["relation"] == "pocket_evidence" for e in graph.json()["edges"])
        assert client.get("/api/jobs").json() == baseline_jobs
    with client_factory() as client:
        assert client.get("/api/research/site-sets/" + sites["id"]).json() == sites
        assert (
            client.get("/api/research/pose-explorations/" + exploration["id"]).json() == exploration
        )


def test_wrong_member_frame_mutated_file_and_faked_prediction_data_do_not_save(
    retained_alignment,
    client_factory,
):
    ensemble, _, assets = retained_alignment
    with client_factory() as client:
        ligand = create_reference(client)
        baseline = client.get("/api/research/site-sets").json()
        body = site_input(ensemble, ligand)
        body["regions"][0]["search"]["frame"] = ensemble.members[1].reference.model_dump(
            mode="json"
        )
        rejected = client.post(
            "/api/research/site-sets", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert rejected.status_code == 422 and "aligned member" in rejected.text
        body = site_input(ensemble, ligand)
        body["regions"][0]["probability"] = 0.99
        assert (
            client.post(
                "/api/research/site-sets", json=body, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 422
        )
        path = assets.path(assets.get(ligand["asset_id"]))
        original = path.read_bytes()
        try:
            for content, reason in (
                (original + b"changed", "size changed"),
                (bytes([original[0] ^ 1]) + original[1:], "integrity"),
            ):
                path.write_bytes(content)
                rejected = client.post(
                    "/api/research/site-sets",
                    json=site_input(ensemble, ligand),
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert rejected.status_code == 422 and reason in rejected.text
        finally:
            path.write_bytes(original)
        assert client.get("/api/research/site-sets").json() == baseline
