"""Controlled contract examples prove finite planning, not scientific pose generation."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.pose_ensembles.contracts import ExplorationInput, ExplorationOptions
from opendde_workbench.pose_ensembles.planning import compile_plan
from opendde_workbench.scientific_objects import MoleculeRef


def reference(digit):
    return MoleculeRef(asset_id=uuid4(), sha256=digit * 64, version_id=uuid4())


def example():
    identifier = uuid4()
    receptors = (reference("a"), reference("b"))
    sites = SimpleNamespace(
        id=identifier,
        sites=[
            SimpleNamespace(
                id=f"m{i:02}-p7",
                member_index=i,
                center=(i * 5, 2, 3),
                native=SimpleNamespace(rank=7),
            )
            for i in range(2)
        ],
        observations=[
            SimpleNamespace(member_index=i, protein=receptors[i], protein_artifact="protein.pdb")
            for i in range(2)
        ],
    )
    value = ExplorationInput(
        site_set_id=identifier,
        site_ids=tuple(s.id for s in sites.sites),
        ligands=[{"reference": reference(d)} for d in ("c", "d")],
        options=ExplorationOptions(seed_count=2),
    )
    return value, sites, receptors


def test_paired_site_ligand_initializations_compile_to_existing_bounded_plan():
    value, sites, receptors = example()
    plan, combinations = compile_plan(value, sites)
    assert len(plan.steps) == len(combinations) == 8
    assert {c.seed for c in combinations} == {2026, 2027}
    assert len({c.step_id for c in combinations}) == 8
    for step, combination in zip(plan.steps, combinations, strict=True):
        assert step.request.operation == "docking" and step.request.mode == "dock"
        assert step.request.receptor == receptors[combination.member_index]
        assert step.request.search.frame == step.request.receptor
        assert step.request.ligand == combination.ligand.reference
        assert step.request.options.seed == combination.seed
        assert step.request.constraints is None
    assert plan.budget.max_jobs == 12 and plan.budget.wall_seconds == 14400


def test_explicit_job_duration_seed_and_input_identity_limits():
    value, sites, _ = example()
    body = value.model_dump(mode="json")
    for patch in ({"max_jobs": 7}, {"wall_seconds": 60}):
        with pytest.raises(ValueError):
            ExplorationInput.model_validate({**body, "options": {**body["options"], **patch}})
    with pytest.raises(ValueError):
        ExplorationOptions(seed_count=2, docking={"seed": 2147483647})
    with pytest.raises(ValueError):
        ExplorationOptions(seed_count=True)
    body["ligands"][0]["reference"]["version_id"] = None
    with pytest.raises(ValueError):
        ExplorationInput.model_validate(body)
    sites.observations[1].protein_artifact = "protein.cif"
    with pytest.raises(ValueError, match="PDB receptors"):
        compile_plan(value, sites)
    sites.id = uuid4()
    with pytest.raises(ValueError, match="identity"):
        compile_plan(value, sites)
