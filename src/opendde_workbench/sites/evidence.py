"""Use real native CSV and exact aligned versions, not client-supplied site claims."""

import hashlib
import json

from ..artifacts import contained
from ..pockets.manifest import VERSION
from ..pockets.output import parse
from ..receptors.result import validate_result
from ..research.receptor_sets import ReceptorSets
from ..research.storage import ScientificStore
from .contracts import NativeSite, SiteObservation


def read_bounded(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 25 * 1024**2:
        raise ValueError("Scientific site evidence is absent, unsafe or oversized.")
    with path.open("rb") as stream:
        data = stream.read(25 * 1024**2 + 1)
    if len(data) > 25 * 1024**2:
        raise ValueError("Scientific site evidence grew beyond its size limit.")
    return data, hashlib.sha256(data).hexdigest()


def load_evidence(store, assets, settings, value):
    ensembles = ReceptorSets(store, assets)
    ensemble = ensembles.get(value.ensemble_id)
    job = store.get(str(ensemble.source_job))
    if not job or job.status != "succeeded" or job.request.operation != "receptor_ensemble":
        raise ValueError("Site comparison requires a successful receptor alignment task.")
    root = settings.state_dir / "jobs" / job.id / "output"
    raw, _ = read_bounded(contained(root, "result.json"))
    result = validate_result(json.loads(raw), job.request, root)
    if (
        tuple(m.evidence for m in ensemble.members) != result.members
        or ensemble.inputs != result.inputs
        or ensemble.options != result.options
    ):
        raise ValueError("Receptor collection differs from its verified alignment output.")
    scientific = ScientificStore(store, assets)
    members = {m.reference: m.evidence.index for m in ensemble.members if m.reference}
    observations = []
    site_count = residue_count = 0
    for identifier in value.pocket_jobs:
        pocket_job = store.get(str(identifier))
        if (
            not pocket_job
            or pocket_job.status != "succeeded"
            or pocket_job.request.operation != "pocket_search"
        ):
            raise ValueError("Select successful native pocket-search tasks.")
        request = pocket_job.request
        member_index = members.get(request.protein)
        if member_index is None:
            raise ValueError("Pocket task must use an exact qualified aligned member version.")
        member = ensemble.members[member_index]
        if not member.evidence.quality or not member.evidence.quality.backbone_complete:
            raise ValueError("Pocket association requires qualified complete-backbone members.")
        scientific.validate_reference(request.protein)
        asset = assets.get(request.protein.asset_id)
        _, protein_sha = read_bounded(assets.path(asset))
        if asset.sha256 != protein_sha or protein_sha != request.protein.sha256:
            raise ValueError("Aligned member file failed integrity verification.")
        output = settings.state_dir / "jobs" / pocket_job.id / "output"
        raw, report_sha = read_bounded(contained(output, "result.json"))
        report = json.loads(raw)
        if (
            not isinstance(report, dict)
            or report.get("operation") != "pocket_search"
            or report.get("complete") is not True
            or report.get("method") != "P2Rank"
            or report.get("software_version") != VERSION
            or report.get("protein") != request.protein.model_dump(mode="json")
            or report.get("profile") != request.profile
        ):
            raise ValueError("Pocket report differs from its native request and method.")
        native = output / "native"
        if native.is_symlink() or not native.is_dir():
            raise ValueError("Native pocket directory is absent or unsafe.")
        predictions = list(native.glob("*_predictions.csv"))
        residues = list(native.glob("*_residues.csv"))
        if len(predictions) != 1 or len(residues) != 1:
            raise ValueError("Pocket evidence requires exactly one native prediction/residue CSV.")
        predictions = contained(output, "native/" + predictions[0].name)
        residues = contained(output, "native/" + residues[0].name)
        _, predictions_sha = read_bounded(predictions)
        _, residues_sha = read_bounded(residues)
        normalized = parse(
            predictions, residues, request.protein.model_dump(mode="json"), request.review_limit
        )
        if any(report.get(k) != v for k, v in normalized.items()):
            raise ValueError("Pocket report differs from its actual native CSV evidence.")
        # Detect a concurrent native-file mutation during normalization.
        if (
            read_bounded(predictions)[1] != predictions_sha
            or read_bounded(residues)[1] != residues_sha
        ):
            raise ValueError("Native pocket evidence changed while being read.")
        artifact = "protein" + asset.suffix
        if report.get("protein_artifact") != artifact or (
            read_bounded(contained(output, artifact))[1] != protein_sha
        ):
            raise ValueError("Pocket coordinates do not belong to the aligned ensemble frame.")
        site_count += len(normalized["pockets"])
        residue_count += sum(len(p["residues"]) for p in normalized["pockets"])
        if site_count > 256 or residue_count > 20000:
            raise ValueError(
                "Site comparison exceeds 256 sites or 20000 residue observations. "
                "Reduce reviewed pocket counts in new source tasks."
            )
        pockets = tuple(NativeSite.model_validate(p) for p in normalized["pockets"])
        for pocket in pockets:
            if any(
                r.structure != request.protein or r.model or r.alternate_location
                for r in pocket.residues
            ):
                raise ValueError("Pocket residues differ from the aligned structural model.")
        observations.append(
            SiteObservation(
                member_index=member_index,
                protein=request.protein,
                source_job=identifier,
                report_sha256=report_sha,
                native_predictions_sha256=predictions_sha,
                native_residues_sha256=residues_sha,
                profile=request.profile,
                method="P2Rank",
                software_version=VERSION,
                protein_artifact=artifact,
                point_threshold=request.point_threshold,
                minimum_cluster=request.minimum_cluster,
                native_pocket_count=normalized["native_pocket_count"],
                truncated=normalized["truncated"],
                pockets=pockets,
            )
        )
    if len({o.member_index for o in observations}) != len(observations):
        raise ValueError("Choose one pocket task per distinct aligned receptor member.")
    observations.sort(key=lambda o: o.member_index)
    return ensemble, tuple(observations)
