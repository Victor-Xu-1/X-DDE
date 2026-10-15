"""Optional source validation is real input, without altering historical request digests."""

import json

import pytest
from pydantic import ValidationError

from opendde_workbench.integrations.contract import IntegratedTask

REFERENCE = {
    "asset_id": "11111111-1111-4111-8111-111111111111",
    "sha256": "a" * 64,
    "record": 0,
    "conformer": 0,
}


def request(**changes):
    payload = {
        "kind": "reinvent",
        "mode": "r_groups",
        "fragments": ["CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1"],
        **changes,
    }
    return {"operation": "reinvent_design", "name": "Declared scaffold origin", "payload": payload}


def test_origin_is_not_an_ignored_attachment_and_requires_its_exact_source_reference():
    value = request(validate_scaffold_origin=True)
    with pytest.raises(ValidationError, match="exact molecular input"):
        IntegratedTask.model_validate(value)
    value.update(inputs=[{"role": "ligand", "source": REFERENCE}], scientific_inputs=[REFERENCE])
    task = IntegratedTask.model_validate(value)
    assert task.payload.validate_scaffold_origin
    assert json.loads(task.model_dump_json())["payload"]["validate_scaffold_origin"] is True
    with pytest.raises(ValidationError, match="R-group design"):
        IntegratedTask.model_validate({**value, "payload": {**value["payload"], "mode": "de_novo"}})


def test_old_and_explicitly_false_requests_keep_the_same_canonical_bytes():
    old = IntegratedTask.model_validate(request())
    disabled = IntegratedTask.model_validate(request(validate_scaffold_origin=False))
    assert old.model_dump_json() == disabled.model_dump_json()
    assert "validate_scaffold_origin" not in json.loads(old.model_dump_json())["payload"]
    unused = request()
    unused.update(inputs=[{"role": "ligand", "source": REFERENCE}], scientific_inputs=[REFERENCE])
    with pytest.raises(ValidationError, match="exact molecular input"):
        IntegratedTask.model_validate(unused)
