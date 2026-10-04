"""Current inspections must be complete; legacy native records stay explicitly unevaluated."""

import hashlib
from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.chemistry.screen_contract import LibraryScreenTask
from opendde_workbench.chemistry.screen_options import ScreenOptions
from opendde_workbench.chemistry.screen_result import LibraryScreenResult, validate_screen


def result_fixture(output, *, mode="alerts", policy="warn", version=2):
    options = ScreenOptions(mode=mode, alert_policy=policy)
    library = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    selected = output / "selected.sdf"
    selected.write_text("exact source record\n$$$$\n")
    report = output / "library-report.csv"
    report.write_text("Input record,Selected\n1,True\n")
    result = {
        "operation": "library_screen",
        "complete": True,
        "schema_version": version,
        "library": library,
        "query": None,
        "options": options.model_dump(mode="json"),
        "rows": [
            {
                "record": 0,
                "available": True,
                "eligible": True,
                "selected": True,
                "output_record": 0,
                "descriptors": {
                    "smiles": "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
                    "mw": 446.902,
                    "logp": 4.2,
                    "tpsa": 60,
                    "qed": 0.6,
                    "hbd": 1,
                    "hba": 7,
                    "rotatable_bonds": 8,
                    "fragments": 1,
                },
            }
        ],
        "selected_records": [0],
        "artifact": selected.name,
        "sha256": hashlib.sha256(selected.read_bytes()).hexdigest(),
        "versions": {"rdkit": "2023.09.6"},
        "fingerprint": {"method": "Morgan", "radius": 2, "bits": 2048, "chirality": True},
        "scope": "chemical_library_selection_not_activity_admet_or_binding_prediction",
        "chemical_processing": "original_records_no_salt_stripping_or_state_enumeration",
        "coordinate_frame": "retained_input_coordinates_not_inferred_binding_pose",
    }
    if version == 2:
        result.update(
            report_artifact=report.name,
            report_sha256=hashlib.sha256(report.read_bytes()).hexdigest(),
        )
        result["rows"][0]["structural_alerts"] = [] if policy != "off" else None
    if mode == "scaffold":
        result["rows"][0]["scaffold_group"] = 0
        result.update(
            scaffold_method="murcko_chiral_acyclic_exact",
            scaffold_groups=[{"index": 0, "kind": "murcko", "smiles": "c1ccccc1", "records": [0]}],
        )
    task = LibraryScreenTask(library=library, options=options)
    return result, task


def test_legacy_record_is_readable_without_inventing_a_risk_inspection(tmp_path):
    value, task = result_fixture(tmp_path, mode="inventory", policy="off", version=1)
    result = validate_screen(value, task, tmp_path)
    assert result.rows[0].structural_alerts is None and result.scaffold_groups is None
    changed = deepcopy(value)
    changed["rows"][0]["structural_alerts"] = []
    with pytest.raises(ValidationError, match="Historical"):
        LibraryScreenResult.model_validate(changed)


def test_current_rule_availability_exclusion_and_catalogue_are_checked(tmp_path):
    value, task = result_fixture(tmp_path)
    assert validate_screen(value, task, tmp_path).rows[0].structural_alerts == ()
    for alerts in (None, [{"catalogue": "NIH", "rule": "unknown"}]):
        changed = deepcopy(value)
        changed["rows"][0]["structural_alerts"] = alerts
        with pytest.raises(ValidationError):
            LibraryScreenResult.model_validate(changed)
    matched = {"catalogue": "BRENK", "rule": "review_pattern"}
    changed = deepcopy(value)
    changed["options"]["alert_policy"] = "exclude"
    changed["rows"][0]["structural_alerts"] = [matched]
    with pytest.raises(ValidationError, match="exclusion policy"):
        LibraryScreenResult.model_validate(changed)
    changed["options"]["alert_policy"] = "warn"
    assert LibraryScreenResult.model_validate(changed).rows[0].selected
    changed["options"]["alert_catalogue"] = "pains"
    with pytest.raises(ValidationError, match="catalogue"):
        LibraryScreenResult.model_validate(changed)


def test_scaffold_membership_and_report_integrity_follow_the_exact_records(tmp_path):
    value, task = result_fixture(tmp_path, mode="scaffold", policy="off")
    assert validate_screen(value, task, tmp_path).scaffold_groups[0].records == (0,)
    for records in ([1], [0, 0], []):
        changed = deepcopy(value)
        changed["scaffold_groups"][0]["records"] = records
        with pytest.raises(ValidationError):
            LibraryScreenResult.model_validate(changed)
    changed = deepcopy(value)
    changed["rows"][0]["scaffold_group"] = None
    with pytest.raises(ValidationError, match="membership"):
        LibraryScreenResult.model_validate(changed)
    (tmp_path / "library-report.csv").write_text("modified")
    with pytest.raises(ValueError, match="report bytes changed"):
        validate_screen(value, task, tmp_path)
