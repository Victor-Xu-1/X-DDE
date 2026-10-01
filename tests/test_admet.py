"""Task and evidence contracts; real scientific predictions are tested in the native server gate."""

from copy import deepcopy
from dataclasses import replace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.admet.contract import AdmetTask
from opendde_workbench.admet.manifest import ENDPOINTS, METADATA, METADATA_DIGEST, VERSIONS
from opendde_workbench.admet.result import AdmetResult
from opendde_workbench.admet.runtime import configuration
from opendde_workbench.admet.serialization import rows_csv
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def molecular_reference():
    return {
        "asset_id": str(uuid4()),
        "sha256": "a" * 64,
        "record": 2,
        "conformer": 0,
        "version_id": str(uuid4()),
    }


def schema_report():
    """Synthetic values exercise report validation, never assert model performance."""
    source = molecular_reference()
    return {
        "operation": "admet_predict",
        "schema_version": 1,
        "complete": True,
        "source": source,
        "source_kind": "molecule",
        "options": {},
        "versions": VERSIONS,
        "endpoint_metadata_sha256": METADATA_DIGEST,
        "model_weights": METADATA["weights"],
        "models_executed": True,
        "rows": [
            {
                "record": 2,
                "source_record_sha256": "a" * 64,
                "name": "Schema validation",
                "smiles": "CCO",
                "duplicate_of_record": None,
                "status": "predicted",
                "reason": None,
                "preview": "source-record-3.sdf",
                "predictions": {name: 0.0 for name in ENDPOINTS},
            }
        ],
        "predicted_count": 1,
        "classification": "complete",
        "csv_sha256": "a" * 64,
        "previews_sha256": {"source-record-3.sdf": "a" * 64},
        "scope": "native_model_predictions_not_measurements_or_clinical_decisions",
        "drugbank_reference": "disabled",
        "applicability_domain": "not_established",
        "uncertainty": "not_provided_by_native_api",
    }


def test_one_exact_record_and_whole_file_are_distinct_provenance_contracts():
    ref = molecular_reference()
    single = AdmetTask(molecule=ref, scientific_inputs=[ref])
    assert TASK_ADAPTER.validate_python(single.model_dump()).operation == "admet_predict"
    assert input_identifiers(single) == {ref["asset_id"]}
    library = {"asset_id": ref["asset_id"], "sha256": ref["sha256"]}
    bulk = AdmetTask(library=library)
    assert input_identifiers(bulk) == {ref["asset_id"]}
    for changes in (
        {"library": library},
        {"molecule": None},
        {"scientific_inputs": []},
        {"name": "   "},
        {"molecule": {**ref, "conformer": 1}},
        {"options": {"cpu": True}},
        {"options": {"cpu": 3}},
        {"options": {"model_directory": "/user/checkpoint"}},
        {"options": {"drugbank_path": "/reference"}},
    ):
        with pytest.raises(ValidationError):
            AdmetTask.model_validate({**single.model_dump(), **changes})
    with pytest.raises(ValidationError):
        AdmetTask(library=library, scientific_inputs=[ref])


def test_report_cannot_drop_endpoints_mix_versions_or_fabricate_reliability():
    report = schema_report()
    assert AdmetResult.model_validate(report).predicted_count == 1
    missing = deepcopy(report)
    missing["rows"][0]["predictions"].pop(ENDPOINTS[0])
    mutations = [
        missing,
        {**report, "versions": {**VERSIONS, "admet-ai": "1.4.0"}},
        {**report, "classification": "partial"},
        {**report, "predicted_count": 0},
        {**report, "models_executed": False},
        {**report, "drugbank_reference": "enabled"},
        {**report, "uncertainty": "90% reliable"},
        {**report, "endpoint_metadata_sha256": "b" * 64},
    ]
    for value in mutations:
        with pytest.raises(ValidationError):
            AdmetResult.model_validate(value)


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), True, "0.5"])
def test_native_predictions_must_be_finite_numeric_values(invalid):
    report = schema_report()
    report["rows"][0]["predictions"][ENDPOINTS[0]] = invalid
    with pytest.raises(ValidationError):
        AdmetResult.model_validate(report)


def test_unavailable_records_keep_reasons_without_made_up_predictions():
    report = schema_report()
    report.update(
        models_executed=False, predicted_count=0, classification="empty", previews_sha256={}
    )
    report["rows"][0].update(
        smiles=None, status="failed", reason="invalid_sdf_record", predictions={}, preview=None
    )
    assert AdmetResult.model_validate(report).classification == "empty"
    report["rows"][0]["predictions"] = {ENDPOINTS[0]: 0.5}
    with pytest.raises(ValidationError):
        AdmetResult.model_validate(report)


def test_prediction_csv_preserves_numeric_values_and_neutralizes_untrusted_text_cells():
    row = schema_report()["rows"][0]
    row.update(name=" =SUM(1,2)", predictions={"Solubility_AqSolDB": -2.75})
    data = rows_csv([row], ["Solubility_AqSolDB"]).decode()
    assert "' =SUM" in data and "-2.75" in data and "3," in data


def test_duplicate_model_representations_keep_original_indices_and_identical_predictions():
    report = schema_report()
    second = deepcopy(report["rows"][0])
    second.update(record=4, duplicate_of_record=2, preview="source-record-5.sdf")
    report.update(rows=[report["rows"][0], second], predicted_count=2)
    assert AdmetResult.model_validate(report).rows[1].duplicate_of_record == 2
    second["duplicate_of_record"] = 0
    with pytest.raises(ValidationError):
        AdmetResult.model_validate(report)
    second["duplicate_of_record"] = 2
    second["predictions"][ENDPOINTS[0]] = 0.1
    with pytest.raises(ValidationError):
        AdmetResult.model_validate(report)


def test_admet_is_an_independent_fixed_environment_without_arbitrary_image_execution(settings):
    from opendde_workbench.deployment.catalog import dependencies
    from opendde_workbench.engine_registry import engine_for

    assert engine_for("admet_predict").id == "admet"
    assert dependencies("admet") == ["admet"]
    for image in (None, "latest", "arbitrary/image:tag", "sha256:invalid"):
        with pytest.raises(ValueError):
            configuration(replace(settings, admet_image=image))
