"""Follow-up case ownership boundaries; real native acceptance is in isolated CI."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.examples import analysis_validation as validation
from opendde_workbench.examples.bundle_projection import references
from opendde_workbench.examples.catalogue import MODULES, validate_catalogue


def test_internal_analysis_has_one_real_visible_parent():
    validate_catalogue()
    assert MODULES["pose.cluster"].parent_capability == "pose_exploration"


@pytest.mark.parametrize(
    "patch",
    [
        {"parent_capability": "missing"},
        {"parent_capability": "pose.cluster"},
        {"case_id": "abl-inhibitors"},
        {"pinned_run_required": False},
    ],
)
def test_internal_analysis_cannot_claim_an_unrelated_or_missing_parent(monkeypatch, patch):
    monkeypatch.setitem(MODULES, "pose.cluster", MODULES["pose.cluster"].model_copy(update=patch))
    with pytest.raises(ValueError, match="parent case"):
        validate_catalogue()


def test_analysis_refuses_a_personal_pose_set_before_loading_or_compiling():
    identifier = uuid4()
    job = SimpleNamespace(request=SimpleNamespace(operation="pose_cluster", pose_set_id=identifier))
    prepared = SimpleNamespace(
        module=MODULES["pose.cluster"],
        source_record={"kind": "pose_exploration", "poses": [{"id": str(uuid4())}]},
    )
    with pytest.raises(ValueError, match="exact fixed parent"):
        validation.validate_analysis(job, prepared, None)


def test_unpinned_parent_and_multi_set_parent_cannot_be_used_as_fixed_source():
    job = SimpleNamespace(request=SimpleNamespace(operation="pose_cluster", pose_set_id=uuid4()))
    for source in (
        None,
        {"kind": "workflows", "poses": []},
        {"kind": "pose_exploration", "poses": []},
    ):
        prepared = SimpleNamespace(module=MODULES["pose.cluster"], source_record=source)
        with pytest.raises(ValueError, match="exact fixed parent"):
            validation.validate_analysis(job, prepared, None)


def test_case_closure_follows_typed_pose_and_receptor_sets_without_following_notes():
    pose, receptor, private = (str(uuid4()) for _ in range(3))
    assert references(
        {"pose_set_id": pose, "receptor_set_id": receptor, "notes": {"pose_set_id": private}}
    ) == {pose, receptor}
