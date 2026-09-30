"""Typed native site reports and API routing use real files and SQLite."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.native_arguments import needs_gpu
from opendde_workbench.pockets.contract import PocketSearch
from opendde_workbench.pockets.output import parse
from opendde_workbench.pockets.runtime import configuration
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64}


def test_pocket_task_has_one_engine_and_no_gpu_dependency():
    ref = reference()
    task = TASK_ADAPTER.validate_python(
        {"operation": "pocket_search", "name": "sites", "protein": ref}
    )
    assert isinstance(task, PocketSearch) and not needs_gpu(task)
    assert input_identifiers(task) == {ref["asset_id"]}
    for overrides in [
        {"threads": 0},
        {"point_threshold": 2},
        {"memory_mib": 100},
        {"profile": "custom.groovy"},
    ]:
        with pytest.raises(ValidationError):
            PocketSearch(name="sites", protein=ref, **overrides)


def test_native_csv_retains_multiple_hypotheses_and_residue_identity(tmp_path):
    predictions = tmp_path / "protein_predictions.csv"
    residues = tmp_path / "protein_residues.csv"
    predictions.write_text(
        "name, rank, score, probability, center_x, center_y, center_z\n"
        "pocket1,1,10,0.8,1,2,3\npocket2,2,4,0.4,4,5,6\n"
    )
    residues.write_text(
        "chain, residue_label, residue_name, score, zscore, probability, pocket\n"
        "A,10,ALA,1,1,0.5,1\nA,11B,GLY,1,1,0.5,2\n"
    )
    from opendde_workbench.scientific_objects import MoleculeRef

    protein = MoleculeRef.model_validate(reference())
    result = parse(predictions, residues, protein.model_dump(mode="json"), 2)
    assert len(result["pockets"]) == 2
    assert result["pockets"][1]["residues"][0]["insertion_code"] == "B"
    assert result["pockets"][0]["residues"][0]["structure"] == protein.model_dump(mode="json")
    limited = parse(predictions, residues, protein.model_dump(mode="json"), 1)
    assert limited["native_pocket_count"] == 2 and limited["truncated"]
    predictions.write_text("name,rank,score,probability,center_x,center_y,center_z\n")
    assert parse(predictions, residues, protein.model_dump(mode="json"), 2)["pockets"] == []


def test_nonfinite_native_report_and_missing_runtime_fail_explicitly(tmp_path, settings):
    p = tmp_path / "p.csv"
    r = tmp_path / "r.csv"
    p.write_text("name,rank,score,probability,center_x,center_y,center_z\nx,1,NaN,.5,0,0,0\n")
    r.write_text("chain,residue_label,pocket\n")
    with pytest.raises(ValidationError):
        parse(p, r, reference(), 20)
    with pytest.raises(ValueError, match="Install P2Rank"):
        configuration(settings)


def test_unconfigured_site_predictor_does_not_dispatch_or_disable_platform(client_factory):
    with client_factory() as client:
        assert client.get("/api/health").json()["platform"]["ready"]
        assert client.get("/api/capabilities/p2rank.detect").status_code == 200
        asset = client.post(
            "/api/assets?kind=structure&name=protein.pdb",
            content=b"ATOM\n",
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        ref = {"asset_id": asset["id"], "sha256": asset["sha256"]}
        response = client.post(
            "/api/jobs",
            json={"operation": "pocket_search", "name": "sites", "protein": ref},
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 503
        assert client.get("/api/jobs").json() == []
