"""Immutable full-graph selections backed by native task identity evidence."""

import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.assets import AssetStore
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.regions import RegionInput, RegionRecords
from opendde_workbench.store import ConflictError, Store


def setup(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    records = RegionRecords(store, assets, settings)
    asset = assets.save("mol.sdf", "ligand", b"molecule\n$$$$\n")
    ref = {"asset_id": asset.id, "sha256": asset.sha256, "record": 0, "conformer": 0}
    job = store.create(
        TASK_ADAPTER.validate_python(
            {
                "operation": "diffsbdd",
                "name": "identity",
                "payload": {"mode": "identity", "molecule": ref},
            }
        ),
        str(uuid4()),
        20,
        100,
    )
    store.claim()
    store.finish(job.id, Status.SUCCEEDED)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    report = {
        "mode": "identity",
        "complete": True,
        "identity_basis": "rdkit_removeHs_record_order",
        "reference": ref,
        "atoms": [{"index": i, "element": "C", "selectable": True} for i in range(4)],
    }
    (output / "result.json").write_text(json.dumps(report))
    value = RegionInput.model_validate(
        {
            "name": "logical regions",
            "subject": ref,
            "identity_job": job.id,
            "regions": [
                {"name": "fixed core", "role": "fixed_core", "atom_indices": [0, 1]},
                {"name": "binder", "role": "binder_a", "atom_indices": [1, 2]},
            ],
        }
    )
    return records, value, job


def test_regions_overlap_without_cutting_graph_and_survive_restart(settings):
    records, value, job = setup(settings)
    key = uuid4()
    saved = records.save(value, key)
    assert records.save(value, key) == saved
    assert saved["body"]["regions"][0]["atom_indices"] == [0, 1]
    assert saved["body"]["regions"][1]["atom_indices"] == [1, 2]
    assert (
        RegionRecords(Store(records.store.path), records.assets, settings).get(saved["id"]) == saved
    )
    changed = value.model_copy(update={"name": "changed"})
    with pytest.raises(ConflictError):
        records.save(changed, key)


def test_invalid_native_atom_or_stale_subject_cannot_be_registered(settings):
    records, value, job = setup(settings)
    body = value.model_dump(mode="json")
    body["regions"][0]["atom_indices"] = [100]
    with pytest.raises(ValueError, match="absent"):
        records.save(RegionInput.model_validate(body), uuid4())
    body = value.model_dump(mode="json")
    body["subject"]["record"] = 1
    with pytest.raises(ValueError, match="versions differ"):
        records.save(RegionInput.model_validate(body), uuid4())
    body = value.model_dump(mode="json")
    body["regions"][0]["atom_indices"] = [0, 0]
    with pytest.raises(ValidationError):
        RegionInput.model_validate(body)


def test_saved_constraints_match_exact_version_and_native_fixed_atoms(settings):
    records, value, job = setup(settings)
    saved = records.save(value, uuid4())
    body = {
        "operation": "diffsbdd",
        "name": "inpaint",
        "payload": {
            "mode": "inpaint",
            "protein": {"asset_id": str(uuid4()), "sha256": "b" * 64},
            "initial": value.subject.model_dump(mode="json"),
            "pocket": {"kind": "ligand", "ligand": value.subject.model_dump(mode="json")},
            "options": {"task": "inpaint", "fixed_atoms": [0, 1], "fragment_policy": "all"},
            "fixed_atoms": [
                {"molecule": value.subject.model_dump(mode="json"), "index": i} for i in [0, 1]
            ],
            "saved_regions": saved["id"],
        },
    }
    request = TASK_ADAPTER.validate_python(body)
    records.check_task(request)
    body["payload"]["options"]["fixed_atoms"] = [0]
    body["payload"]["fixed_atoms"] = body["payload"]["fixed_atoms"][:1]
    with pytest.raises(ValueError, match="do not agree"):
        records.check_task(TASK_ADAPTER.validate_python(body))
    body["payload"]["saved_regions"] = str(uuid4())
    with pytest.raises(ValueError, match="no longer exist"):
        records.check_task(TASK_ADAPTER.validate_python(body))


@pytest.mark.parametrize("bad", [True, 1.0, -1, 5000])
def test_region_atom_indices_require_real_bounded_integers(bad):
    with pytest.raises(ValidationError):
        RegionInput.model_validate(
            {
                "name": "test",
                "subject": {"asset_id": str(uuid4()), "sha256": "a" * 64},
                "identity_job": str(uuid4()),
                "regions": [{"name": "A", "role": "binder_a", "atom_indices": [bad]}],
            }
        )


def test_revision_lineage_exact_version_filter_and_legacy_replay(settings, client_factory):
    import hashlib

    records, value, job = setup(settings)
    key = uuid4()
    saved = records.save(value, key)
    changed = RegionInput.model_validate(
        {**value.model_dump(mode="json"), "parent_id": saved["id"], "name": "Revised selections"}
    )
    revised = records.save(changed, uuid4())
    assert records.get(saved["id"])["body"]["name"] == value.name
    assert revised["body"]["parent_id"] == saved["id"]
    assert len(records.list(subject=value.subject)) == 2
    assert records.list(subject=value.subject.model_copy(update={"record": 2})) == []
    with client_factory() as client:
        edges = client.get("/api/research/graph").json()["edges"]
        assert {
            "source": "region:" + saved["id"],
            "target": "region:" + revised["id"],
            "relation": "revised_regions",
        } in edges
    legacy = value.model_dump(mode="json")
    legacy.pop("parent_id")
    body = json.dumps(legacy)
    with records.store.connect() as db:
        db.execute(
            "UPDATE research_regions SET body=?,sha256=? WHERE id=?",
            (body, hashlib.sha256(body.encode()).hexdigest(), saved["id"]),
        )
    assert records.save(value, key)["id"] == saved["id"]


def test_region_public_schema_filters_and_mutation_boundary(client_factory, settings):
    records, value, job = setup(settings)
    saved = records.save(value, uuid4())
    with client_factory() as client:
        response = client.get("/api/research/regions/schema")
        assert response.status_code == 200
        assert {role["id"] for role in response.json()["roles"]} == {
            "fixed_core",
            "binder_a",
            "binder_b",
            "linker",
            "payload",
            "mutable",
            "custom",
        }
        query = f"?asset_id={value.subject.asset_id}&record=0&conformer=0"
        assert client.get("/api/research/regions" + query).json()[0]["id"] == saved["id"]
        assert (
            client.get("/api/research/regions" + query.replace("record=0", "record=2")).json() == []
        )
        assert client.get("/api/research/regions?record=2").status_code == 422
        assert (
            client.post(
                "/api/research/regions",
                json=value.model_dump(mode="json"),
                headers={"Idempotency-Key": str(uuid4()), "Origin": "https://example.com"},
            ).status_code
            == 403
        )
        response = client.post(
            "/api/research/regions",
            json=value.model_dump(mode="json"),
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 201
        assert (
            client.get("/api/assets/" + str(value.subject.asset_id)).content == b"molecule\n$$$$\n"
        )
