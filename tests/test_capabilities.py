"""Real public metadata/schema endpoints; no scientific availability is fabricated."""

import sys
from dataclasses import replace
from pathlib import Path

from opendde_workbench.capabilities import frontend_catalogue, request_schema
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.capabilities.modalities import MODALITIES, modality_catalogue
from opendde_workbench.capabilities.runtime import availability
from opendde_workbench.engine_registry import engine_for


def test_inventory_matches_router_and_excludes_unimplemented_forms():
    for spec in CAPABILITIES.values():
        assert all(engine_for(op).id == spec.environment for op in spec.operations)
    visible = {item["id"] for item in frontend_catalogue()}
    assert "native.inspect" not in visible
    assert "properties" in visible
    assert all(CAPABILITIES[id].frontend_form for id in visible)


def test_schemas_are_owned_values_not_mutable_global_state():
    schema = request_schema()
    schema.clear()
    assert "$defs" in request_schema()
    assert "DiffTask" in request_schema()["$defs"]


def test_runtime_configuration_does_not_assert_model_or_scientific_acceptance(settings):
    state = {"backends": {"diffsbdd": {"ready": True}}}
    status = availability(CAPABILITIES["diffsbdd.inpaint"], settings, state)
    assert status.configuration_present
    assert status.requires_native_preflight
    assert status.scientific_validation == "target_server_pending"
    assert "selected_model" in status.request_specific_checks
    assert "fixed_atom_identity_and_bonds" in status.request_specific_checks
    assert not availability(CAPABILITIES["predict"], settings, state).configuration_present
    harness = replace(settings, harness_python=Path(sys.executable))
    assert availability(CAPABILITIES["compare"], harness, {}).configuration_present
    assert not availability(CAPABILITIES["esm"], harness, {}).configuration_present


def test_api_catalogue_schema_errors_and_no_dispatch(client_factory):
    with client_factory() as client:
        response = client.get("/api/capabilities")
        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "X-DDE"
        assert data["modalities"] == modality_catalogue()
        assert client.get("/api/capabilities/campaign").json()["modalities"] == [
            "biologic",
            "antibody",
            "protein",
        ]
        assert len(data["capabilities"]) == len(CAPABILITIES)
        assert client.get("/api/capabilities/predict").json()["id"] == "predict"
        assert client.get("/api/capabilities/no-such-tool").status_code == 404
        schema = client.get("/api/capabilities/request-schema").json()
        assert "DiffTask" in schema["task_request"]["$defs"]
        assert schema["native_harness_schema_endpoint"] == "/api/harness/schemas"
        assert client.get("/api/jobs").json() == []
        assert response.headers["cache-control"] == "no-store"
        assert all("path" not in item["availability"] for item in data["capabilities"])


def test_modalities_are_explicit_overlapping_and_preserve_scientific_scope():
    known = {item.id for item in MODALITIES}
    assert len(known) == len(MODALITIES)
    for item in CAPABILITIES.values():
        assert item.modalities
        assert set(item.modalities) <= known
        assert len(set(item.modalities)) == len(item.modalities)
    assert set(CAPABILITIES["campaign"].modalities) == {"biologic", "antibody", "protein"}
    assert CAPABILITIES["properties"].modalities == ("chemical", "small_molecule")
    assert "rna" in CAPABILITIES["features"].modalities
    assert "dna" not in CAPABILITIES["features"].modalities
    assert "rna" not in CAPABILITIES["diffsbdd.generate"].modalities
    assert CAPABILITIES["p2rank.detect"].modality_role == "target_context"
    assert CAPABILITIES["workflows"].modality_role == "shared"
    assert set(CAPABILITIES["workflows"].modalities) == known
    projection = {item["id"]: item for item in frontend_catalogue()}
    assert projection["campaign"]["modalities"] == ["biologic", "antibody", "protein"]
    public = modality_catalogue()
    public[0]["label"][0] = "changed"
    assert modality_catalogue()[0]["label"][0] == "生物药"
