"""Quality context, strict report coverage and unchanged raw-record identities."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.chemistry.sdf_io import split_records
from opendde_workbench.quality.contract import PoseQualityTask
from opendde_workbench.quality.manifest import CHECKS, CONFIG_DIGESTS
from opendde_workbench.quality.normalize import summarize
from opendde_workbench.quality.result import PoseQualityResult
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def ref():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}


def test_quality_requires_exact_versions_and_explicit_coordinate_context():
    molecule, protein, reference = ref(), ref(), ref()
    task = PoseQualityTask(molecule=molecule, scientific_inputs=[molecule])
    assert TASK_ADAPTER.validate_python(task.model_dump()).operation == "pose_quality"
    assert input_identifiers(task) == {molecule["asset_id"]}
    for body in (
        {"scientific_inputs": []},
        {"protein": protein},
        {"options": {"profile": "dock"}},
        {
            "options": {"profile": "dock"},
            "protein": protein,
            "scientific_inputs": [molecule, protein],
        },
        {
            "options": {"profile": "redock"},
            "protein": protein,
            "scientific_inputs": [molecule, protein],
            "coordinate_basis": "user_confirmed",
        },
        {"options": {"profile": "mol", "arbitrary_yaml": "/etc/passwd"}},
    ):
        with pytest.raises(ValidationError):
            PoseQualityTask.model_validate({**task.model_dump(), **body})
    task = PoseQualityTask(
        molecule=molecule,
        protein=protein,
        reference=reference,
        coordinate_basis="user_confirmed",
        scientific_inputs=[molecule, protein, reference],
        options={"profile": "redock"},
    )
    assert input_identifiers(task) == {row["asset_id"] for row in (molecule, protein, reference)}


def test_missing_checks_never_become_a_quality_pass_and_coverage_cannot_be_changed():
    checks = [{"id": name, "outcome": "pass"} for name in CHECKS["mol"]]
    checks[-1]["outcome"] = "unavailable"
    report = {
        "operation": "pose_quality",
        "complete": True,
        "schema_version": 1,
        "inputs": {"molecule": ref()},
        "options": {"profile": "mol"},
        "coordinate_basis": None,
        "classification": "incomplete",
        "checks": checks,
        "metrics": {},
        "previews_sha256": {},
        "versions": {
            "posebusters": "0.6.5",
            "rdkit": "2025.9.5",
            "numpy": "2.2.6",
            "pandas": "2.3.3",
        },
        "native_config_sha256": CONFIG_DIGESTS["mol"],
        "scope": "native_pose_plausibility_not_binding_affinity_or_experimental_validation",
    }
    assert PoseQualityResult.model_validate(report).classification == "incomplete"
    for changes in (
        {"classification": "passes"},
        {"checks": checks[:-1]},
        {"metrics": {"bad": float("nan")}},
        {"native_config_sha256": "a" * 64},
    ):
        with pytest.raises(ValidationError):
            PoseQualityResult.model_validate({**report, **changes})
    checks[0]["outcome"] = "fail"
    assert summarize(checks) == "fails"


def test_raw_record_splitter_preserves_invalid_empty_and_eof_source_positions():
    raw = b"first\nM END\n$$$$\ninvalid\n$$$$\n$$$$\nlast\nM END\n"
    assert split_records(raw) == [b"first\nM END\n", b"invalid\n", b"", b"last\nM END\n"]
    with pytest.raises(ValueError, match="500"):
        split_records(b"empty\n$$$$\n" * 501)


def test_quality_is_independent_and_cannot_inject_a_runtime(settings):
    from dataclasses import replace

    from opendde_workbench.deployment.catalog import dependencies
    from opendde_workbench.engine_registry import engine_for
    from opendde_workbench.quality.runtime import configuration

    with pytest.raises(ValueError, match="PoseBusters"):
        configuration(settings)
    for image in ("latest", "sha256:not-a-digest", "arbitrary/image:tag"):
        with pytest.raises(ValueError):
            configuration(replace(settings, posebusters_image=image))
    assert engine_for("pose_quality").id == "posebusters"
    assert dependencies("posebusters") == ["posebusters"]
