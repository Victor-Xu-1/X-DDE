"""Brain intent reuses native ADMET without changing legacy request or report bytes."""

import json
import sqlite3
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.admet.contract import AdmetTask
from opendde_workbench.admet.presentation import present_admet
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.task_history.kinds import classification_sql, classify_request


def task(**changes):
    ref = {
        "asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0,
        "conformer": 0, "version_id": None,
    }
    return AdmetTask(molecule=ref, scientific_inputs=[ref], **changes)


def test_absent_intent_preserves_legacy_serialization():
    original = task()
    payload = original.model_dump(mode="json")
    assert "focus" not in payload
    assert classify_request(payload) == "admet.predict"
    assert TASK_ADAPTER.validate_python(payload).model_dump(mode="json") == payload
    assert original.model_copy(update={"focus": None}).model_dump(mode="json") == payload


def test_profile_uses_the_same_native_options_and_engine():
    brain = task(focus="brain")
    payload = brain.model_dump(mode="json")
    assert payload["operation"] == "admet_predict" and payload["focus"] == "brain"
    assert brain.options.model_dump() == task().options.model_dump()
    assert TASK_ADAPTER.validate_python(payload).focus == "brain"
    assert classify_request(payload) == "admet.brain"
    assert engine_for(brain.operation).id == "admet"
    spec = CAPABILITIES["admet.brain"]
    assert spec.environment == "admet" and spec.native_mode == "brain"
    assert spec.source == CAPABILITIES["admet.predict"].source
    for value in ("efflux", "graphb3", "Kpuu", 1, True):
        with pytest.raises(ValidationError):
            task(focus=value)


def test_sql_and_python_classification_preserve_both_histories():
    sql, parameters = classification_sql()
    values = [task().model_dump(mode="json"), task(focus="brain").model_dump(mode="json")]
    with sqlite3.connect(":memory:") as db:
        db.execute("CREATE TABLE jobs (request TEXT)")
        db.executemany("INSERT INTO jobs VALUES (?)", [(json.dumps(v),) for v in values])
        rows = db.execute("SELECT " + sql + " FROM jobs j", parameters).fetchall()
    assert [row[0] for row in rows] == [classify_request(v) for v in values]


def test_intent_does_not_mutate_the_raw_report(monkeypatch):
    raw = {
        "rows": [], "operation": "admet_predict", "models_executed": True,
        "options": task().options.model_dump(),
    }
    before = deepcopy(raw)

    class Report:
        def model_dump(self, **_):
            return deepcopy(raw)

    monkeypatch.setattr(
        "opendde_workbench.admet.presentation.validate_admet", lambda *_: Report()
    )
    assets = SimpleNamespace(get=lambda _: SimpleNamespace(name="STAT6-warhead.sdf"))
    general = task()
    assert "focus" not in present_admet(raw, SimpleNamespace(request=general), None, assets)
    brain = general.model_copy(update={"focus": "brain"})
    shown = present_admet(raw, SimpleNamespace(request=brain), None, assets)
    assert shown["focus"] == "brain" and len(shown["endpoints"]) == 41
    assert shown["models_executed"] and shown["options"] == raw["options"]
    assert raw == before


def test_brain_example_requires_the_actual_recorded_intent(monkeypatch):
    from opendde_workbench.examples.pin_validation import validate_case_job

    observed = []
    monkeypatch.setattr(
        "opendde_workbench.examples.pin_validation.validate_input_lineage",
        lambda *args: observed.append(args),
    )
    prepared = SimpleNamespace(module=SimpleNamespace(parent_capability=None))
    brain_job = SimpleNamespace(request=task(focus="brain"))
    validate_case_job("admet.brain", brain_job, prepared, None)
    assert observed == [(brain_job, prepared, None)]
    with pytest.raises(ValueError, match="native mode"):
        validate_case_job("admet.brain", SimpleNamespace(request=task()), prepared, None)
