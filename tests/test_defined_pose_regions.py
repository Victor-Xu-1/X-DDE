"""Defined sites retain real search conditions without impersonating predictions."""

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from test_pose_exploration_contract import example, reference

from opendde_workbench.examples.record_sources import pose_source_jobs
from opendde_workbench.pose_ensembles.contracts import ExplorationInput, PoseCombination
from opendde_workbench.pose_ensembles.planning import compile_plan
from opendde_workbench.sites.contracts import SITE_SET_ADAPTER
from opendde_workbench.sites.definitions import DefinedSite, DefinedSiteInput, DefinedSiteSet


def defined_example():
    old, _, receptors = example()
    source = DefinedSiteInput(
        kind="defined_regions",
        ensemble_id=uuid4(),
        regions=[
            {
                "label": "Retained reference pocket",
                "member_index": 0,
                "search": {
                    "kind": "reference_ligand",
                    "frame": receptors[0],
                    "reference": reference("e"),
                    "coordinate_basis": "user_confirmed",
                },
            },
            {
                "label": "Explicit alternative region",
                "member_index": 1,
                "search": {
                    "kind": "box",
                    "frame": receptors[1],
                    "box": {"center": (1, 2, 3), "size": (8, 10, 12)},
                },
            },
        ],
    )
    sites = DefinedSiteSet(
        id=uuid4(),
        request=source,
        reference=receptors[0],
        alignment_job=uuid4(),
        sites=[
            DefinedSite(
                id=f"m{r.member_index:02}-r{i + 1}",
                member_index=r.member_index,
                protein=r.search.frame,
                label=r.label,
                search=r.search,
            )
            for i, r in enumerate(source.regions)
        ],
        created_at="2026-10-16T00:00:00+00:00",
    )
    value = ExplorationInput(
        site_set_id=sites.id,
        site_ids=[s.id for s in sites.sites],
        ligands=old.ligands,
        options=old.options,
    )
    return value, sites


def test_portable_pose_sources_do_not_fabricate_pocket_prediction_jobs_for_defined_regions():
    _, sites = defined_example()
    ensemble = SimpleNamespace(source_job=sites.alignment_job)
    assert pose_source_jobs(ensemble, sites, [], None, None) == [str(sites.alignment_job)]
    _, native_sites, _ = example()
    assert pose_source_jobs(ensemble, native_sites, [], None, None) == list(
        dict.fromkeys(
            [
                str(ensemble.source_job),
                *[str(o.source_job) for o in native_sites.observations],
            ]
        )
    )


def test_reference_and_box_searches_use_the_existing_native_workflow_without_predicted_scores():
    value, sites = defined_example()
    plan, combinations = compile_plan(value, sites)
    assert len(plan.steps) == len(combinations) == 8
    assert {c.seed for c in combinations} == {2026, 2027}
    for step, c in zip(plan.steps, combinations, strict=True):
        expected = sites.sites[c.member_index]
        assert step.request.operation == "docking" and step.request.mode == "dock"
        assert step.request.search == expected.search
        assert step.request.receptor == expected.protein
        assert step.request.search.frame == step.request.receptor
        assert step.request.ligand == c.ligand.reference
        assert step.request.options.seed == c.seed
        assert c.source_kind == "defined_search" and c.source_label == expected.label
        assert c.pocket_rank is None
        assert not {"pocket_rank", "score", "probability"} & c.model_dump().keys()
    assert plan.steps[0].request.search.kind == "reference_ligand"
    assert plan.steps[4].request.search.box.size == (8, 10, 12)
    assert plan.failure_policy == "continue_independent"


def test_legacy_source_and_combination_serialization_does_not_gain_new_fields():
    value, sites, _ = example()
    assert list(value.model_dump()) == ["name", "site_set_id", "site_ids", "ligands", "options"]
    assert ExplorationInput.model_validate_json(value.model_dump_json()) == value
    _, combinations = compile_plan(value, sites)
    assert list(combinations[0].model_dump()) == [
        "step_id",
        "site_id",
        "member_index",
        "pocket_rank",
        "receptor",
        "ligand_index",
        "ligand",
        "seed",
    ]


def test_the_existing_site_authority_round_trips_the_new_tagged_definition_kind():
    _, sites = defined_example()
    assert SITE_SET_ADAPTER.validate_json(sites.model_dump_json()) == sites
    assert sites.schema_version == 2
    assert not {"observations", "groups", "probability", "relations"} & sites.model_dump().keys()
    assert sites.scientific_scope == "defined_search_conditions_not_predicted_or_observed_binding"
    invalid = json.loads(sites.model_dump_json())
    invalid["sites"][0]["search"]["frame"] = reference("f").model_dump(mode="json")
    with pytest.raises(ValueError, match="saved defined site"):
        SITE_SET_ADAPTER.validate_python(invalid)


def test_a_reference_requires_its_exact_saved_version_and_explicit_coordinate_confirmation():
    _, sites = defined_example()
    source = sites.request.model_dump(mode="json")
    for field in ("reference", "frame"):
        missing = json.loads(sites.request.model_dump_json())
        missing["regions"][0]["search"][field]["version_id"] = None
        with pytest.raises(ValueError, match="exact saved"):
            DefinedSiteInput.model_validate(missing)
    del source["regions"][0]["search"]["coordinate_basis"]
    with pytest.raises(ValueError):
        DefinedSiteInput.model_validate(source)


def test_defined_sites_keep_existing_combination_time_and_source_identity_limits():
    value, sites = defined_example()
    body = value.model_dump(mode="json")
    for patch in ({"max_jobs": 7}, {"wall_seconds": 60}):
        with pytest.raises(ValueError):
            ExplorationInput.model_validate({**body, "options": {**body["options"], **patch}})
    source = sites.request.model_dump(mode="json")
    source["regions"][1] = {**source["regions"][0], "label": "Different label; same conditions"}
    with pytest.raises(ValueError, match="only once"):
        DefinedSiteInput.model_validate(source)
    with pytest.raises(ValueError, match="absent"):
        compile_plan(value.model_copy(update={"site_ids": ("m00-r99",)}), sites)
    with pytest.raises(ValueError, match="identity"):
        compile_plan(value.model_copy(update={"site_set_id": uuid4()}), sites)


def test_defined_conditions_cannot_acquire_fake_pocket_ranks_or_prediction_scores():
    value, sites = defined_example()
    _, combinations = compile_plan(value, sites)
    body = combinations[0].model_dump(mode="json")
    with pytest.raises(ValueError, match="fabricated pocket rank"):
        PoseCombination.model_validate({**body, "pocket_rank": 1})
    with pytest.raises(ValueError, match="predicted site"):
        PoseCombination.model_validate({**body, "source_kind": None})
    definition = sites.request.model_dump(mode="json")
    definition["regions"][0]["probability"] = 0.99
    with pytest.raises(ValueError):
        DefinedSiteInput.model_validate(definition)
