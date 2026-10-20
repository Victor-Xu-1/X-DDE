"""Keep newly docked ligand and receptor outputs in one exact coordinate frame."""

import hashlib

from ..artifacts import contained
from ..docking.result import DockingResult

TARGETS = {
    "quality_molecule": ("ligand", "pose_artifact"),
    "quality_protein": ("structure", "receptor_artifact"),
}


def validate_bindings(step, predecessors):
    bindings = [b for b in step.bindings if b.target in TARGETS]
    if not bindings:
        return
    if step.request.operation != "pose_quality" or step.request.options.profile != "dock":
        raise ValueError("Docking quality handoff requires the receptor-frame dock profile.")
    if {b.target for b in bindings} != set(TARGETS) or len({b.from_step for b in bindings}) != 1:
        raise ValueError("Quality handoff must bind both pose and receptor from one docking step.")
    for binding in bindings:
        previous = predecessors[binding.from_step]
        kind, field = TARGETS[binding.target]
        if (
            previous.request.operation != "docking"
            or binding.kind != kind
            or binding.result_field != field
            or binding.artifact is not None
            or binding.target == "quality_protein"
            and binding.record != 0
        ):
            raise ValueError("Quality inputs require the actual declared docking outputs.")


def validate_source(binding, job, root, file):
    if job.request.operation != "docking":
        raise ValueError("The quality producer is not a native docking task.")
    report = contained(root, "result.json")
    if report.stat().st_size > 2 * 1024**2:
        raise ValueError("Docking report exceeds its typed handoff limit.")
    result = DockingResult.model_validate_json(report.read_text())
    if (
        result.receptor != job.request.receptor
        or result.ligand != job.request.ligand
        or result.options != job.request.options
        or result.mode != job.request.mode
    ):
        raise ValueError("Docking handoff differs from the completed native request.")
    expected = getattr(result, TARGETS[binding.target][1])
    if file != contained(root, expected):
        raise ValueError("Quality input is not the declared native output.")
    if binding.target == "quality_protein":
        if hashlib.sha256(file.read_bytes()).hexdigest() != result.frame.sha256:
            raise ValueError("Quality receptor bytes differ from the native coordinate frame.")
    else:
        eligible_records = {
            p.qualified_record if result.raw_pose_artifact else p.record
            for p in result.poses
            if p.valid
        }
        if binding.record not in eligible_records:
            raise ValueError("No qualified native pose exists at the chosen record.")
