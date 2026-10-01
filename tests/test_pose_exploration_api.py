"""Real SQLite/files/API protocol tests; controlled records are not inference evidence."""

import hashlib
from uuid import uuid4

from opendde_workbench.assets import AssetStore
from opendde_workbench.scientific_objects import MoleculeRef, ResidueRef
from opendde_workbench.sites.contracts import (
    BindingSiteSet,
    NativeSite,
    SiteEvidence,
    SiteInput,
    SiteObservation,
)
from opendde_workbench.store import Store, now


def controlled_sources(client, settings):
    refs = []
    for i in range(2):
        response = client.post(
            "/api/assets?kind=structure&name=controlled" + str(i) + ".pdb",
            content=("HEADER controlled protocol structure " + str(i) + "\nEND\n").encode(),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201
        version = client.post(
            "/api/research/objects",
            json={
                "kind": "structure",
                "asset_id": response.json()["id"],
                "label": "controlled context",
            },
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        refs.append(MoleculeRef.model_validate(version["reference"]))
    ligand = client.post(
        "/api/assets?kind=ligand&name=controlled.sdf",
        content=(
            b"controlled protocol record\n\n\n"
            b"  0  0  0  0  0  0            999 V2000\nM  END\n$$$$\n"
        ),
        headers={"Content-Type": "application/octet-stream"},
    ).json()
    molecular = client.post(
        "/api/research/objects",
        json={"kind": "molecule", "asset_id": ligand["id"], "label": "controlled protocol ligand"},
        headers={"Idempotency-Key": str(uuid4())},
    ).json()
    observations, sites = [], []
    jobs = (uuid4(), uuid4())
    for i, ref in enumerate(refs):
        native = NativeSite(
            rank=1,
            name="controlled site",
            score=1,
            probability=0.5,
            center_x=i,
            center_y=0,
            center_z=0,
            residues=(ResidueRef(structure=ref, chain="A", number=1),),
        )
        observations.append(
            SiteObservation(
                member_index=i,
                protein=ref,
                source_job=jobs[i],
                report_sha256="a" * 64,
                native_predictions_sha256="b" * 64,
                native_residues_sha256="c" * 64,
                profile="experimental",
                method="P2Rank",
                software_version="2.5.1",
                protein_artifact="protein.pdb",
                point_threshold=0.4,
                minimum_cluster=3,
                native_pocket_count=1,
                truncated=False,
                pockets=(native,),
            )
        )
        sites.append(
            SiteEvidence(
                id=f"m{i:02}-p1",
                member_index=i,
                native=native,
                mapped_residues=(),
                mapping_coverage=0,
                mapping_status="insufficient",
                center=(i, 0, 0),
            )
        )
    # This fixture represents a controlled, already persisted boundary record.
    # Native validation for real SiteSets is exercised by remote native suites.
    identifier = uuid4()
    record = BindingSiteSet(
        id=identifier,
        request=SiteInput(ensemble_id=uuid4(), pocket_jobs=jobs),
        reference=refs[0],
        alignment_job=uuid4(),
        observations=tuple(observations),
        sites=tuple(sites),
        relations=(),
        groups=(),
        created_at=now(),
    )
    body = record.model_dump_json()
    store = Store(settings.state_dir / "jobs.sqlite3")
    with store.connect() as db:
        db.execute(
            "INSERT INTO research_site_sets VALUES(?,?,?,?,?,?)",
            (
                str(identifier),
                str(record.request.ensemble_id),
                hashlib.sha256(record.request.model_dump_json().encode()).hexdigest(),
                body,
                hashlib.sha256(body.encode()).hexdigest(),
                record.created_at,
            ),
        )
    return record, molecular, store


def test_exact_source_plan_atomicity_csrf_idempotency_and_restart(client_factory, settings):
    with client_factory() as client:
        sites, molecular, store = controlled_sources(client, settings)
        body = {
            "site_set_id": str(sites.id),
            "site_ids": [s.id for s in sites.sites],
            "ligands": [{"reference": molecular["reference"]}],
        }
        key = str(uuid4())
        denied = client.post(
            "/api/research/pose-explorations",
            json=body,
            headers={"Idempotency-Key": key, "X-Workbench-CSRF": "bad"},
        )
        assert denied.status_code == 403
        response = client.post(
            "/api/research/pose-explorations", json=body, headers={"Idempotency-Key": key}
        )
        assert response.status_code == 201, response.text
        record = response.json()
        assert len(record["combinations"]) == 2
        assert (
            client.post(
                "/api/research/pose-explorations", json=body, headers={"Idempotency-Key": key}
            ).json()
            == record
        )
        assert (
            client.post(
                "/api/research/pose-explorations",
                json={**body, "name": "changed"},
                headers={"Idempotency-Key": key},
            ).status_code
            == 409
        )
        plan = client.get("/api/workflows/plans/" + record["plan_id"]).json()
        assert plan["sha256"] == record["plan_sha256"]
        assert plan["body"]["failure_policy"] == "continue_independent"
        assert len(plan["body"]["steps"]) == 2
        for step, combination in zip(plan["body"]["steps"], record["combinations"], strict=True):
            assert step["request"]["receptor"] == combination["receptor"]
            assert step["request"]["ligand"] == molecular["reference"]
        assert client.get("/api/jobs").json() == []
        before = len(client.get("/api/workflows/plans").json())
        invalid = {**body, "site_ids": ["m00-p999"]}
        assert (
            client.post(
                "/api/research/pose-explorations",
                json=invalid,
                headers={"Idempotency-Key": str(uuid4())},
            ).status_code
            == 422
        )
        assert len(client.get("/api/workflows/plans").json()) == before
        assets = AssetStore(store, settings.state_dir / "assets")
        path = assets.path(assets.get(molecular["reference"]["asset_id"]))
        original = path.read_bytes()
        path.write_bytes(original.replace(b"controlled", b"CONtrolled"))
        bad = client.post(
            "/api/research/pose-explorations", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert bad.status_code == 422 and "integrity" in bad.text
        path.write_bytes(original)
    with client_factory() as client:
        assert client.get("/api/research/pose-explorations/" + record["id"]).json() == record


def test_cancelled_unattempted_combinations_are_preserved_without_fabricated_poses(
    client_factory, settings
):
    with client_factory() as client:
        sites, molecular, store = controlled_sources(client, settings)
        record = client.post(
            "/api/research/pose-explorations",
            json={
                "site_set_id": str(sites.id),
                "site_ids": [s.id for s in sites.sites],
                "ligands": [{"reference": molecular["reference"]}],
            },
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        run_id = str(uuid4())
        stamp = now()
        with store.connect() as db:
            db.execute(
                "INSERT INTO workflow_runs VALUES(?,?,?,?,?,?)",
                (run_id, record["plan_id"], "cancelled", None, stamp, stamp),
            )
        endpoint = (
            "/api/research/pose-explorations/" + record["id"] + "/runs/" + run_id + "/capture"
        )
        response = client.post(endpoint, json={})
        assert response.status_code == 201, response.text
        poses = response.json()
        assert poses["qualified_pose_count"] == 0 and poses["collection_status"] == "partial"
        assert all(o["status"] == "not_attempted" and not o["poses"] for o in poses["outcomes"])
        assert client.post(endpoint, json={}).json() == poses
        assert client.get("/api/research/pose-ensembles/" + poses["id"]).json() == poses
        graph = client.get("/api/research/graph?focus=pose_set:" + poses["id"]).json()
        assert any(n["kind"] == "pose_ensemble" for n in graph["nodes"])
        assert any(e["relation"] == "native_pose_evidence" for e in graph["edges"])
