"""Host wrapper in the existing supervised process group; no queue or provider client."""

import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.result import DockingResult
from opendde_workbench.research.constraint_contract import ConstraintExecution


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-gnina-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Docking result manifest is invalid or oversized.")
    result = DockingResult.model_validate_json(file.read_text())
    request = DockingTask.model_validate_json((directory / "request.json").read_text())
    if (
        result.receptor != request.receptor
        or result.ligand != request.ligand
        or result.mode != request.mode
        or result.options != request.options
        or result.search != request.search
        or result.constraint_reference != request.constraints
    ):
        raise ValueError("Native result does not match the exact task request.")
    if request.constraints:
        receipt = ConstraintExecution.model_validate_json(
            (directory / "constraint-execution.json").read_text()
        )
        expected = {c.id: c for c in receipt.document.conditions if c.kind == "spatial_bounds"}
        for pose in result.poses:
            checks = {c.condition_id: c for c in pose.constraint_checks}
            # Chemical failures have no valid conformer to check; accepted or bounds-rejected
            # poses must have complete checks for all requested postconditions.
            if (pose.valid or pose.constraint_checks) and set(checks) != set(expected):
                raise ValueError(
                    "Native output omitted or invented an independent condition check."
                )
            for identifier, check in checks.items():
                condition = expected[identifier]
                if (check.validator, check.selection, check.strength, check.weight) != (
                    condition.validator,
                    condition.selection,
                    condition.strength,
                    condition.weight,
                ):
                    raise ValueError(
                        "Native output-check settings differ from the immutable condition."
                    )
                if check.tolerance_angstrom != condition.tolerance_angstrom:
                    raise ValueError("Output-check tolerance differs from the immutable condition.")
                for violation in check.violations:
                    excess = tuple(
                        max(0.0, abs(v - c) - s / 2 - condition.tolerance_angstrom)
                        for v, c, s in zip(
                            violation.position,
                            condition.box.center,
                            condition.box.size,
                            strict=True,
                        )
                    )
                    if excess != violation.excess:
                        raise ValueError(
                            "Violation coordinates and declared receptor-frame excess differ."
                        )
    output = directory / "output"
    for name in (
        result.pose_artifact,
        result.receptor_artifact,
        *((result.raw_pose_artifact,) if result.raw_pose_artifact else ()),
        *(p.artifact for p in result.poses if p.valid),
        *(p.diagnostic_artifact for p in result.poses if p.diagnostic_artifact),
    ):
        artifact = output / name
        if (
            artifact.is_symlink()
            or not artifact.is_file()
            or artifact.stat().st_size > 25 * 1024**2
        ):
            raise ValueError("Declared native output is missing, unsafe or oversized.")


if __name__ == "__main__":
    main()
