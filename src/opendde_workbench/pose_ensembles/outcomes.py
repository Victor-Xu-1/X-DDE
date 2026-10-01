"""Capture real indexed native evidence and retain unsuccessful combinations explicitly."""

import hashlib

from ..artifacts import contained
from ..docking.result import DockingResult
from ..research.storage import ScientificStore
from .models import PoseMember, PoseOutcome


def native_outcome(combination, job, store, assets, settings):
    root = settings.state_dir / "jobs" / job.id / "output"
    document = contained(root, "result.json")
    if document.stat().st_size > 2 * 1024**2:
        raise ValueError("Native pose report exceeds its typed bound.")
    with document.open("rb") as stream:
        raw = stream.read(2 * 1024**2 + 1)
    if len(raw) > 2 * 1024**2:
        raise ValueError("Native pose report grew beyond its typed bound.")
    result = DockingResult.model_validate_json(raw)
    expected = job.request
    if (
        expected.operation != "docking"
        or expected.mode != "dock"
        or expected.receptor != combination.receptor
        or expected.ligand != combination.ligand.reference
        or expected.options.seed != combination.seed
        or (
            result.mode,
            result.receptor,
            result.ligand,
            result.options,
            result.search,
            result.constraint_reference,
        )
        != (
            expected.mode,
            expected.receptor,
            expected.ligand,
            expected.options,
            expected.search,
            expected.constraints,
        )
    ):
        raise ValueError("Native pose result differs from its exact paired exploration input.")
    scientific = ScientificStore(store, assets)
    versions = []
    for offset in range(0, 1000, 200):
        page = scientific.list(200, offset, source_job=job.id)
        versions.extend(page)
        if len(page) < 200:
            break
    else:
        raise ValueError("Native pose-version listing exceeded its bounded capture limit.")
    pool = {
        (v.label, v.kind, v.reference.sha256, v.reference.record): v.reference for v in versions
    }
    checksum = hashlib.sha256(raw).hexdigest()
    report_ref = pool.get(("result.json", "analysis", checksum, 0))
    if report_ref is None:
        raise ValueError("Native report is not indexed or changed after asset registration.")

    def verified(reference):
        scientific.validate_reference(reference)
        asset = assets.get(reference.asset_id)
        with assets.path(asset).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != reference.sha256:
                raise ValueError("Indexed native pose evidence failed file integrity verification.")

    verified(report_ref)
    members = []
    for pose in result.poses:
        reference = None
        if pose.valid:
            file = contained(root, pose.artifact)
            if file.stat().st_size > 25 * 1024**2:
                raise ValueError("Native pose artifact exceeds its size bound.")
            with file.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            reference = pool.get((pose.artifact, "molecule", digest, 0))
            if reference is None:
                raise ValueError("Qualified pose is not indexed or changed after registration.")
            verified(reference)
        members.append(PoseMember(evidence=pose, reference=reference))
    return PoseOutcome(
        combination=combination,
        job_id=job.id,
        status="succeeded",
        report_reference=report_ref,
        software_version=result.software_version,
        binary_sha256=result.binary_sha256,
        parser=result.parser,
        initial_conformer_generated=result.initial_conformer_generated,
        scientific_outcome=result.scientific_outcome,
        poses=tuple(members),
    )


def capture_outcomes(exploration, run, store, assets, settings, plan):
    expected = {s.id: s.request for s in plan.steps}
    attempts = {a["step_id"]: a for a in run["attempts"]}
    if not set(attempts) <= set(expected):
        raise ValueError("Workflow contains attempts outside the immutable exploration plan.")
    outcomes = []
    for combination in exploration.combinations:
        attempt = attempts.get(combination.step_id)
        if attempt is None:
            outcomes.append(
                PoseOutcome(
                    combination=combination,
                    job_id=None,
                    status="not_attempted",
                    reason="This combination was not attempted before the run ended.",
                )
            )
            continue
        job = store.get(attempt["job_id"])
        if job is None:
            outcomes.append(
                PoseOutcome(
                    combination=combination,
                    job_id=attempt["job_id"],
                    status="missing",
                    reason="Source task record is missing; restore its history.",
                )
            )
            continue
        if job.request != expected[combination.step_id]:
            raise ValueError("Attempt request differs from its immutable exploration step.")
        if job.status == "succeeded":
            outcomes.append(native_outcome(combination, job, store, assets, settings))
        elif job.status in {"failed", "cancelled", "interrupted"}:
            outcomes.append(
                PoseOutcome(
                    combination=combination,
                    job_id=job.id,
                    status=job.status,
                    reason="Source task ended as " + job.status + "; inspect its task log.",
                )
            )
        else:
            raise ValueError("Wait for every active native attempt to stop before capturing poses.")
    return tuple(outcomes)
