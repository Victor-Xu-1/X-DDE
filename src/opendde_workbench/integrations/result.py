"""Scientific outputs are typed and bound to original requests and actual artifact bytes."""

import hashlib
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained
from ..proximity.result_models import TernaryResult


class NativeMetric(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    value: float = Field(allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=60)
    method: str = Field(min_length=1, max_length=120)
    meaning: Literal["score", "confidence", "descriptor", "energy", "validation"]


class NativeCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    smiles: str | None = Field(default=None, max_length=5000)
    sequence: str | None = Field(default=None, max_length=10000)
    metrics: list[NativeMetric] = Field(default_factory=list, max_length=40)
    geometry: Literal["predicted_structure", "unbound_conformer", "source_frame", "none"] = "none"


class NativeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: str
    schema_version: Literal[1] = 1
    complete: Literal[True] = True
    request_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    program: str
    version: str
    candidates: list[NativeCandidate] = Field(default_factory=list, max_length=1000)
    metrics: list[NativeMetric] = Field(default_factory=list, max_length=40)
    artifact_sha256: dict[str, str] = Field(min_length=1, max_length=1100)
    model_artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    potential_artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    proximity: TernaryResult | None = None
    structure_artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    potential_unit: Literal["kBT/e"] | None = None
    interactions: list["NativeInteraction"] = Field(default_factory=list, max_length=1000)
    validation_points: list["ValidationPoint"] = Field(default_factory=list, max_length=500)
    scope: Literal["native_computation_not_experimental_measurement"] = (
        "native_computation_not_experimental_measurement"
    )


class NativeInteraction(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal[
        "hydrogen_bond",
        "hydrophobic",
        "salt_bridge",
        "pi_stack",
        "pi_cation",
        "halogen_bond",
        "water_bridge",
        "metal_complex",
    ]
    chain: str = Field(min_length=1, max_length=8)
    number: int = Field(ge=-99999, le=999999)
    residue: str = Field(min_length=1, max_length=8)
    protein_position: tuple[float, float, float]
    ligand_position: tuple[float, float, float]
    distance: float = Field(ge=0, le=20, allow_inf_nan=False)
    bridge_position: tuple[float, float, float] | None = None


class ValidationPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    smiles: str = Field(min_length=1, max_length=5000)
    observed: float
    predicted: float


def validate_result(value, request, output):
    result = NativeResult.model_validate(value)
    expected = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    if (
        result.operation != request.operation
        or result.program != request.payload.kind
        or result.request_sha256 != expected
    ):
        raise ValueError("Native result differs from its exact task snapshot.")
    identities = [item.id for item in result.candidates]
    if len(identities) != len(set(identities)):
        raise ValueError("Native candidate identities must be unique.")
    required = {item.artifact for item in result.candidates if item.artifact}
    required.update(
        name
        for name in (result.model_artifact, result.potential_artifact, result.structure_artifact)
        if name
    )
    if not required <= result.artifact_sha256.keys():
        raise ValueError("Native scientific files are missing their exact byte identities.")
    for name, expected_digest in result.artifact_sha256.items():
        if not name or "/" in name or "\\" in name or name in {".", "..", "result.json"}:
            raise ValueError("Native output identities must refer to direct scientific files.")
        file = contained(output, name)
        if not 0 < file.stat().st_size <= 1024**3:
            raise ValueError("Native scientific file is empty or exceeds its size budget.")
        with file.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != expected_digest:
            raise ValueError("Native scientific artifact bytes changed.")
    if request.operation == "chemprop_train" and not result.model_artifact:
        raise ValueError("Property training produced no reusable native checkpoint.")
    if request.operation == "electrostatics" and not (
        result.potential_artifact and result.structure_artifact and result.potential_unit == "kBT/e"
    ):
        raise ValueError("Electrostatic calculation produced no coordinate-bound potential map.")
    if (
        request.operation
        in {
            "boltz_predict",
            "reinvent_design",
            "ligandmpnn_design",
            "boltzgen_design",
            "structure_refine",
            "chemprop_predict",
        }
        and not result.candidates
    ):
        raise ValueError("The scientific program produced no usable native candidates.")
    if request.operation == "ternary_model":
        from ..proximity.result import validate_ternary

        validate_ternary(result, request, output)
    elif result.proximity is not None:
        raise ValueError("Ternary evidence belongs only to its exact native operation.")
    return result
