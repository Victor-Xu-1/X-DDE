"""Input budgets and explicit receptor correspondences; science runs remotely."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.receptors.contract import ReceptorEnsembleTask
from opendde_workbench.receptors.selection import MemberSelection


def inputs():
    return [{"structure": {"asset_id": str(uuid4()), "sha256": digit * 64}} for digit in ("a", "b")]


def test_structural_selections_cannot_alias_models_or_duplicate_input_members():
    value = {"inputs": inputs()}
    assert ReceptorEnsembleTask.model_validate(value).options.reference_index == 0
    for change in ("duplicate", "bad_reference", "molecular_record", "extra_input"):
        body = {"inputs": inputs()}
        if change == "duplicate":
            body["inputs"][1] = body["inputs"][0]
        elif change == "bad_reference":
            body["options"] = {"reference_index": 2}
        elif change == "molecular_record":
            body["inputs"][0]["structure"]["record"] = 1
        else:
            body["pretend_flexible_sampling"] = True
        with pytest.raises(ValidationError):
            ReceptorEnsembleTask.model_validate(body)
    value["inputs"][1] = dict(value["inputs"][0], selection={"model_index": 1})
    assert ReceptorEnsembleTask.model_validate(value).inputs[1].selection.model_index == 1


def test_chain_and_residue_correspondences_are_explicit_and_one_to_one():
    with pytest.raises(ValidationError):
        MemberSelection(chains=("A", "A"))
    with pytest.raises(ValidationError):
        MemberSelection(
            chain_pairs=[{"reference": "A", "moving": "A"}, {"reference": "B", "moving": "A"}]
        )
    anchor = {"reference": {"chain": "A", "number": 10}, "moving": {"chain": "B", "number": 20}}
    with pytest.raises(ValidationError):
        MemberSelection(residue_pairs=[anchor, anchor])
    with pytest.raises(ValidationError):
        MemberSelection(chain_pairs=[{"reference": "A", "moving": "B"}], residue_pairs=[anchor])
    assert MemberSelection(residue_pairs=[anchor]).residue_pairs[0].moving.number == 20
