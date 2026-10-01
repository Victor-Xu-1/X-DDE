"""Compile finite combinations into the existing immutable workflow contract."""

from ..docking.contract import DockingTask, ExplicitSearch
from ..docking.options import SearchBox
from ..workflows.contracts import Budget, PlanInput, Step
from .contracts import PoseCombination


def compile_plan(value, sites):
    if sites.id != value.site_set_id:
        raise ValueError("Selected site-set identity differs from its immutable evidence.")
    by_id = {site.id: site for site in sites.sites}
    observations = {row.member_index: row for row in sites.observations}
    combinations, steps = [], []
    for site_id in value.site_ids:
        site = by_id.get(site_id)
        if site is None:
            raise ValueError("Selected pocket hypothesis is absent from this saved site set.")
        observation = observations[site.member_index]
        if observation.protein_artifact != "protein.pdb":
            raise ValueError(
                "GNINA needs PDB receptors; convert with explicit frame provenance first."
            )
        for ligand_index, ligand in enumerate(value.ligands):
            for offset in range(value.options.seed_count):
                seed = value.options.docking.seed + offset
                step_id = f"pose_{len(steps):03}"
                combination = PoseCombination(
                    step_id=step_id,
                    site_id=site_id,
                    member_index=site.member_index,
                    pocket_rank=site.native.rank,
                    receptor=observation.protein,
                    ligand_index=ligand_index,
                    ligand=ligand,
                    seed=seed,
                )
                request = DockingTask(
                    name=f"Receptor {site.member_index + 1} pocket {site.native.rank} "
                    f"ligand {ligand_index + 1} seed {seed}",
                    mode="dock",
                    receptor=observation.protein,
                    ligand=ligand.reference,
                    search=ExplicitSearch(
                        kind="box",
                        frame=observation.protein,
                        box=SearchBox(center=site.center, size=value.options.box_size),
                    ),
                    options=value.options.docking.model_copy(update={"seed": seed}),
                )
                combinations.append(combination)
                steps.append(Step(id=step_id, request=request))
    plan = PlanInput(
        name=value.name,
        failure_policy="continue_independent",
        steps=tuple(steps),
        budget=Budget(max_jobs=value.options.max_jobs, wall_seconds=value.options.wall_seconds),
    )
    return plan, tuple(combinations)
