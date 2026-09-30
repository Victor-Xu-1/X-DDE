"""Constraint conditions exercise typed contracts, real SQLite, CSRF and execution boundaries."""

import hashlib
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.assets import AssetStore
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.constraint_contract import ConstraintReference, ConstraintSet
from opendde_workbench.research.constraint_records import ConstraintRecords
from opendde_workbench.store import ConflictError, Store


def setup(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    molecule = assets.save("molecule.sdf", "ligand", b"mol\n$$$$\n")
    receptor = assets.save("receptor.pdb", "structure", b"ATOM\nEND\n")
    subject = {"asset_id": molecule.id, "sha256": molecule.sha256}
    frame = {"asset_id": receptor.id, "sha256": receptor.sha256}
    value = ConstraintSet.model_validate(
        {
            "name": "Receptor anchored search",
            "subject": subject,
            "frame": {"reference": frame, "basis": "reference_coordinates"},
            "conditions": [
                {
                    "id": str(uuid4()),
                    "label": "Search",
                    "kind": "search_box",
                    "box": {"center": [1, 2, 3], "size": [20, 20, 20]},
                }
            ],
        }
    )
    records = ConstraintRecords(store, assets, settings)
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "docking",
            "name": "Research",
            "receptor": frame,
            "ligand": subject,
            "search": {
                "kind": "box",
                "frame": frame,
                "box": {"center": [1, 2, 3], "size": [20, 20, 20]},
            },
        }
    )
    return records, value, request


def reference(saved):
    return ConstraintReference(id=saved["id"], sha256=saved["sha256"])


def test_immutable_revisions_idempotency_restarts_and_digest_integrity(settings):
    records, value, _ = setup(settings)
    key = uuid4()
    saved = records.save(value, key)
    assert records.save(value, key) == saved
    assert (
        ConstraintRecords(Store(records.store.path), records.assets, settings).get(saved["id"])
        == saved
    )
    revised = value.model_copy(update={"name": "Revised", "parent_id": UUID(saved["id"])})
    with pytest.raises(ConflictError):
        records.save(revised, key)
    child = records.save(revised, uuid4())
    assert child["body"]["parent_id"] == saved["id"]
    assert records.get(saved["id"])["body"]["name"] == value.name
    assert len(records.list(subject=value.subject)) == 2
    assert records.list(subject=value.subject.model_copy(update={"record": 1})) == []
    with records.store.connect() as db:
        db.execute("UPDATE research_constraints SET body=? WHERE id=?", ("{}", saved["id"]))
    with pytest.raises(ValueError, match="integrity"):
        records.get(saved["id"])


def test_contract_conflicts_units_frames_and_soft_weights(settings):
    _, value, _ = setup(settings)
    body = value.model_dump(mode="json")
    for modify in (
        lambda v: v.update(frame=None),
        lambda v: v["frame"].update(unit="nm"),
        lambda v: v["conditions"][0].update(strength="soft"),
        lambda v: v["conditions"][0].update(weight=3),
        lambda v: v["conditions"][0]["box"].update(center=[float("nan"), 0, 0]),
        lambda v: v.update(name=" "),
        lambda v: v["conditions"].append(v["conditions"][0].copy()),
    ):
        import copy

        bad = copy.deepcopy(body)
        modify(bad)
        with pytest.raises(ValidationError):
            ConstraintSet.model_validate(bad)
    import copy

    bad = copy.deepcopy(body)
    second = copy.deepcopy(bad["conditions"][0])
    second.update(id=str(uuid4()), label="Conflicting search")
    second["box"]["center"][0] = 9
    bad["conditions"].append(second)
    with pytest.raises(ValidationError, match="Conflicting"):
        ConstraintSet.model_validate(bad)


def test_support_cannot_claim_soft_scope_or_parameter_mismatches(settings):
    records, value, request = setup(settings)
    saved = records.save(value, uuid4())
    result = records.preview(reference(saved), request)
    assert result.executable and result.conditions[0].support == "native"
    assert result.conditions[0].independent_result_check == "not_implemented"
    assert hashlib.sha256(result.document.model_dump_json().encode()).hexdigest() == saved["sha256"]
    bad = request.model_dump(mode="json")
    bad["search"]["box"]["center"][0] = 10
    bad["constraints"] = reference(saved).model_dump(mode="json")
    with pytest.raises(ValueError, match="differ"):
        records.check_task(TASK_ADAPTER.validate_python(bad))
    with pytest.raises(ValueError, match="digest"):
        records.preview(ConstraintReference(id=saved["id"], sha256="f" * 64), request)
    for changes, code in [
        ({"scope": "assembly"}, "wrong_scope"),
        ({"strength": "soft", "weight": 2}, "soft_unsupported"),
    ]:
        body = value.model_dump(mode="json")
        body["conditions"][0].update(changes)
        changed = records.save(ConstraintSet.model_validate(body), uuid4())
        result = records.preview(reference(changed), request)
        assert not result.executable and result.conditions[0].reason_code == code


def test_fixed_regions_compile_only_exact_native_selection(settings, client_factory):
    from test_regions import setup as setup_regions

    regions, selection, _ = setup_regions(settings)
    saved_region = regions.save(selection, uuid4())
    records = ConstraintRecords(regions.store, regions.assets, settings)
    value = ConstraintSet.model_validate(
        {
            "name": "Fixed binder",
            "subject": selection.subject,
            "conditions": [
                {
                    "id": str(uuid4()),
                    "label": "Preserve binder",
                    "kind": "fixed_region",
                    "region_id": saved_region["id"],
                    "region_name": "binder",
                }
            ],
        }
    )
    saved = records.save(value, uuid4())
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "diffsbdd",
            "name": "Inpaint",
            "payload": {
                "mode": "inpaint",
                "protein": {"asset_id": str(uuid4()), "sha256": "a" * 64},
                "initial": selection.subject,
                "pocket": {"kind": "ligand", "ligand": selection.subject},
                "options": {"task": "inpaint", "fragment_policy": "all", "fixed_atoms": [1, 2]},
                "fixed_atoms": [{"molecule": selection.subject, "index": i} for i in [1, 2]],
            },
        }
    )
    ref = reference(saved)
    result = records.preview(ref, request)
    assert result.executable and result.conditions[0].value == [1, 2]
    assert result.conditions[0].independent_result_check == "rdkit_fixed_core_v1"
    from opendde_workbench.research.constraint_compile import compile_constraints

    legacy = compile_constraints(value, ref, request, regions, fixed_core_check=False)
    assert legacy.conditions[0].independent_result_check == "not_implemented"
    # A real persisted failed launch still exposes its frozen plan; an old receipt
    # keeps its historical absence of independent checking.
    import json

    from opendde_workbench.models import Status

    protein = regions.assets.save("controlled.pdb", "structure", b"controlled receptor\n")
    body = request.model_dump(mode="json")
    body["payload"]["protein"] = {"asset_id": protein.id, "sha256": protein.sha256}
    body["constraints"] = ref.model_dump(mode="json")
    persisted = TASK_ADAPTER.validate_python(body)
    job = regions.store.create(persisted, str(uuid4()), 20, 100)
    regions.store.finish(job.id, Status.FAILED, "controlled pre-launch failure")
    directory = settings.state_dir / "jobs" / job.id
    directory.mkdir(parents=True)
    receipt = directory / "constraint-execution.json"
    receipt.write_text(result.model_dump_json())
    with client_factory() as client:
        response = client.get(f"/api/jobs/{job.id}/constraints")
        assert response.status_code == 200, response.text
        assert response.json()["conditions"][0]["independent_result_check"] == "rdkit_fixed_core_v1"
        receipt.write_text(legacy.model_dump_json())
        response = client.get(f"/api/jobs/{job.id}/constraints")
        assert response.status_code == 200, response.text
        assert response.json()["conditions"][0]["independent_result_check"] == "not_implemented"
        receipt.write_text(result.model_dump_json())
        (directory / "execution.json").write_text(
            json.dumps({"core_verification": "rdkit_fixed_core_v1"})
        )
        assert client.get(f"/api/jobs/{job.id}/constraints").status_code == 200

    body = request.model_dump(mode="json")
    body["payload"]["options"]["fixed_atoms"] = [1]
    body["payload"]["fixed_atoms"] = body["payload"]["fixed_atoms"][:1]
    assert not records.preview(ref, TASK_ADAPTER.validate_python(body)).executable


def test_constraint_api_csrf_filters_graph_and_execution_receipt(settings, client_factory):
    records, value, request = setup(settings)
    with client_factory() as client:
        assert client.get("/api/research/constraints/schema").status_code == 200
        headers = {"Idempotency-Key": str(uuid4())}
        assert (
            client.post(
                "/api/research/constraints",
                json=value.model_dump(mode="json"),
                headers={**headers, "Origin": "https://example.com"},
            ).status_code
            == 403
        )
        response = client.post(
            "/api/research/constraints", json=value.model_dump(mode="json"), headers=headers
        )
        assert response.status_code == 201, response.text
        saved = response.json()
        ref = reference(saved)
        assert (
            client.get(
                "/api/research/constraints", params={"asset_id": str(value.subject.asset_id)}
            ).json()[0]["id"]
            == saved["id"]
        )
        assert client.get("/api/research/constraints?record=1").status_code == 422
        result = client.post(
            "/api/research/constraint-support",
            json={
                "reference": ref.model_dump(mode="json"),
                "request": request.model_dump(mode="json"),
            },
        )
        assert result.status_code == 200 and result.json()["executable"]
        # A real persisted job and frozen receipt, without claiming scientific inference.
        body = request.model_dump(mode="json")
        body["constraints"] = ref.model_dump(mode="json")
        job = records.store.create(TASK_ADAPTER.validate_python(body), str(uuid4()), 20, 100)
        records.store.claim()
        records.store.finish(job.id, Status.FAILED, "Controlled evidence fixture")
        directory = settings.state_dir / "jobs" / job.id
        directory.mkdir(parents=True)
        assert client.get("/api/jobs/" + job.id + "/constraints").json()["state"] == "not_started"
        receipt = records.check_task(job.request)
        (directory / "constraint-execution.json").write_text(receipt.model_dump_json())
        result = client.get("/api/jobs/" + job.id + "/constraints")
        assert result.status_code == 200 and result.json()["state"] == "captured_for_execution"
        original = receipt.model_dump(mode="json")
        original["conditions"][0]["value"]["center"][0] = 77
        from opendde_workbench.research.constraint_contract import ConstraintExecution

        (directory / "constraint-execution.json").write_text(
            ConstraintExecution.model_validate(original).model_dump_json()
        )
        assert client.get("/api/jobs/" + job.id + "/constraints").status_code == 422
        (directory / "constraint-execution.json").write_text(receipt.model_dump_json())
        edges = client.get("/api/research/graph").json()["edges"]
        assert {
            "source": "constraint:" + saved["id"],
            "target": "task:" + job.id,
            "relation": "used_conditions",
        } in edges
        (directory / "constraint-execution.json").write_text(
            receipt.model_copy(
                update={"reference": ConstraintReference(id=uuid4(), sha256=ref.sha256)}
            ).model_dump_json()
        )
        assert client.get("/api/jobs/" + job.id + "/constraints").status_code == 422


def test_output_conditions_are_postchecks_and_infeasible_bounds_fail(settings):
    records, value, request = setup(settings)
    body = value.model_dump(mode="json")
    body["conditions"][0].update(
        kind="spatial_bounds",
        phase="result",
        validator="rdkit_receptor_bounds_v1",
        selection="all_heavy_atoms",
        strength="soft",
        weight=2,
    )
    changed = ConstraintSet.model_validate(body)
    saved = records.save(changed, uuid4())
    support = records.preview(reference(saved), request)
    assert support.executable and support.conditions[0].support == "result_check"
    assert support.conditions[0].native_parameter is None
    assert support.conditions[0].independent_result_check == "rdkit_receptor_bounds_v1"
    body["conditions"][0].update(strength="hard", weight=None)
    import copy

    second = copy.deepcopy(body["conditions"][0])
    second.update(id=str(uuid4()), label="Far bounds")
    second["box"]["center"][0] = 999
    body["conditions"].append(second)
    with pytest.raises(ValidationError, match="no common spatial region"):
        ConstraintSet.model_validate(body)


def test_typed_spatial_evidence_rejects_false_success_units_or_deviation():
    from opendde_workbench.docking.quality import BoundsCheck

    value = {
        "condition_id": str(uuid4()),
        "validator": "rdkit_receptor_bounds_v1",
        "selection": "all_heavy_atoms",
        "strength": "hard",
        "weight": None,
        "unit": "angstrom",
        "passed": False,
        "checked_points": 1,
        "tolerance_angstrom": 0,
        "violations": [{"output_atom_index": 0, "position": [3, 0, 0], "excess": [1, 0, 0]}],
        "maximum_excess": 1,
        "weighted_deviation": None,
    }
    assert not BoundsCheck.model_validate(value).passed
    for update in (
        {"passed": True},
        {"unit": "nm"},
        {"maximum_excess": 0},
        {"strength": "soft"},
        {"checked_points": 0},
    ):
        with pytest.raises(ValidationError):
            BoundsCheck.model_validate({**value, **update})
