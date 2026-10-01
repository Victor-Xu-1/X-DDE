"""Independent typed report validation binds every test to the exact input and profile."""

import hashlib
from typing import Literal

from pydantic import Field, FiniteFloat, model_validator

from ..artifacts import contained
from ..chemistry.sdf_io import split_records
from ..scientific_objects import MoleculeRef, ScientificModel
from .contract import references
from .manifest import CHECKS, CONFIG_DIGESTS
from .normalize import summarize
from .options import QualityOptions


class Check(ScientificModel):
    id: str = Field(min_length=1, max_length=100)
    outcome: Literal["pass", "fail", "unavailable"]


class PoseQualityResult(ScientificModel):
    operation: Literal["pose_quality"]
    complete: Literal[True]
    schema_version: Literal[1]
    inputs: dict[str, MoleculeRef]
    options: QualityOptions
    coordinate_basis: Literal["user_confirmed"] | None
    classification: Literal["passes", "fails", "incomplete"]
    checks: tuple[Check, ...] = Field(min_length=1, max_length=50)
    metrics: dict[str, FiniteFloat] = Field(max_length=150)
    versions: dict[str, str]
    native_config_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    previews_sha256: dict[str, str]
    scope: Literal["native_pose_plausibility_not_binding_affinity_or_experimental_validation"]

    @model_validator(mode="after")
    def evidence(self):
        if tuple(row.id for row in self.checks) != CHECKS[
            self.options.profile
        ] or self.classification != summarize([row.model_dump() for row in self.checks]):
            raise ValueError(
                "Native check coverage/classification differs from the selected profile."
            )
        if self.native_config_sha256 != CONFIG_DIGESTS[self.options.profile]:
            raise ValueError("Native configuration changed.")
        if self.versions != {
            "posebusters": "0.6.5",
            "rdkit": "2025.9.5",
            "numpy": "2.2.6",
            "pandas": "2.3.3",
        }:
            raise ValueError("Quality implementation versions differ from the reviewed runtime.")
        return self


def validate_quality(value, task, output):
    result = PoseQualityResult.model_validate(value)
    if (
        result.inputs != dict(references(task))
        or result.options != task.options
        or result.coordinate_basis != task.coordinate_basis
    ):
        raise ValueError("Quality report differs from the exact source/version/context.")
    for role, ref in references(task):
        suffix = ".pdb" if role == "protein" else ".sdf"
        file = contained(output.parent / "assets", str(ref.asset_id) + suffix)
        if (
            file.stat().st_size > 25 * 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != ref.sha256
        ):
            raise ValueError("Original quality input bytes changed.")
        if role in {"molecule", "protein"}:
            name = role + "-preview" + suffix
            content = (
                split_records(file.read_bytes())[ref.record] + b"\n$$$$\n"
                if role == "molecule"
                else file.read_bytes()
            )
            if (
                result.previews_sha256.get(name) != hashlib.sha256(content).hexdigest()
                or contained(output, name).read_bytes() != content
            ):
                raise ValueError("Diagnostic quality preview changed from its exact source record.")
    if set(result.previews_sha256) != {"molecule-preview.sdf"} | (
        {"protein-preview.pdb"} if task.protein else set()
    ):
        raise ValueError("Unexpected quality preview artifact identity.")
    return result
