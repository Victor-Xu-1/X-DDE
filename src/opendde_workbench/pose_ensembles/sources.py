"""Exact saved structural and chemical sources are validated before planning."""

import hashlib

from ..research.state_sets import StateSets
from ..research.storage import ScientificStore
from ..sites.storage import SiteSets
from .planning import compile_plan


def validate_sources(value, store, assets, settings):
    sites = SiteSets(store, assets, settings).get(value.site_set_id)
    scientific, states = ScientificStore(store, assets), StateSets(store, assets)
    for ligand in value.ligands:
        scientific.validate_reference(ligand.reference)
        asset = assets.get(ligand.reference.asset_id)
        if asset.kind != "ligand" or asset.suffix != ".sdf":
            raise ValueError("Pose exploration requires exact saved SDF molecular versions.")
        if ligand.state_set_id:
            collection = states.get(ligand.state_set_id)
            if ligand.state_index >= len(collection.members):
                raise ValueError("Selected chemical state is absent from its saved collection.")
            member = collection.members[ligand.state_index]
            if ligand.conformer_index is None:
                expected = member.reference
            else:
                if ligand.conformer_index >= len(member.conformers):
                    raise ValueError("Selected free conformer is absent from its chemical state.")
                expected = member.conformers[ligand.conformer_index].reference
            if expected != ligand.reference:
                raise ValueError(
                    "Selected molecule differs from its declared state/conformer version."
                )
    plan, combinations = compile_plan(value, sites)
    checked = set()
    for step in plan.steps:
        bindings = assets.validate_bindings(step.request)
        for asset in bindings.values():
            if asset.id not in checked:
                with assets.path(asset).open("rb") as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                if digest != asset.sha256:
                    raise ValueError("Exploration input failed its actual file-integrity check.")
                checked.add(asset.id)
    return sites, plan, combinations
