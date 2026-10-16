"""Verify exact native-aligned members before retaining explicit search definitions."""

from ..docking.contract import ReferenceSearch
from ..receptors.alignment_evidence import aligned_ensemble, read_bounded
from ..research.contracts import ScientificObject
from ..research.storage import ScientificStore
from .definitions import DefinedSite


def definition_references(value):
    for region in value.regions:
        yield "structure", ".pdb", region.search.frame
        if isinstance(region.search, ReferenceSearch):
            yield "ligand", ".sdf", region.search.reference


def load_definitions(store, assets, settings, value):
    ensemble = aligned_ensemble(store, assets, settings, value.ensemble_id)
    scientific = ScientificStore(store, assets)
    sites = []
    for index, region in enumerate(value.regions):
        if region.member_index >= len(ensemble.members):
            raise ValueError("The defined region's aligned receptor member is absent.")
        member = ensemble.members[region.member_index]
        if (
            member.reference != region.search.frame
            or member.evidence.index != region.member_index
            or not member.evidence.quality
            or not member.evidence.quality.backbone_complete
            or member.evidence.transformation is None
        ):
            raise ValueError("Use the exact qualified aligned member as the search frame.")
        sites.append(
            DefinedSite(
                id=f"m{region.member_index:02}-r{index + 1}",
                member_index=region.member_index,
                protein=member.reference,
                label=region.label,
                search=region.search,
            )
        )
    checked, total = set(), 0
    for kind, suffix, reference in definition_references(value):
        scientific.validate_reference(reference)
        asset = assets.get(reference.asset_id)
        if asset.kind != kind or asset.suffix != suffix or asset.sha256 != reference.sha256:
            raise ValueError("Choose exact saved aligned PDB receptors and SDF reference ligands.")
        if asset.id not in checked:
            file = assets.path(asset)
            total += file.stat().st_size
            if total > 256 * 1024**2:
                raise ValueError("Defined search sources exceed the 256 MiB input budget.")
            if read_bounded(file)[1] != reference.sha256:
                raise ValueError("A defined search source failed its actual file-integrity check.")
            checked.add(asset.id)
    return ensemble, tuple(sites)


def validate_definition_snapshot(db, value, ensemble):
    source = db.execute(
        "SELECT status FROM jobs WHERE id=?", (str(ensemble.source_job),)
    ).fetchone()
    if source is None or source["status"] != "succeeded":
        raise ValueError("The native alignment source became unavailable before saving.")
    for _, _, reference in definition_references(value):
        row = db.execute(
            "SELECT body FROM scientific_objects WHERE id=?", (str(reference.version_id),)
        ).fetchone()
        if row is None or ScientificObject.model_validate_json(row["body"]).reference != reference:
            raise ValueError("A saved search reference changed before saving the site set.")
