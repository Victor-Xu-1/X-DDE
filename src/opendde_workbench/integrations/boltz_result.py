"""Optional, exact candidate-to-native-confidence evidence for new Boltz results."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BoltzSample(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str = Field(pattern=r"^structure-\d{3}$")
    native_rank: int = Field(ge=0, le=9, strict=True)
    structure_artifact: str = Field(pattern=r"^structure-\d{3}\.cif$")
    pae_artifact: str | None = Field(default=None, pattern=r"^structure-\d{3}-pae\.npz$")
    pde_artifact: str | None = Field(default=None, pattern=r"^structure-\d{3}-pde\.npz$")
    plddt_artifact: str | None = Field(default=None, pattern=r"^structure-\d{3}-plddt\.npz$")


class BoltzEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol: Literal["boltz-2.2.1-cif-row-v1"]
    writer_version: Literal["2.2.1"]
    mapping_artifact: Literal["boltz-processed-structure.npz"] | None = None
    samples: list[BoltzSample] = Field(min_length=1, max_length=10)


def validate_boltz_result(result, request):
    evidence = result.boltz
    if evidence is None:
        return
    if (
        result.program != "boltz"
        or result.operation != "boltz_predict"
        or request.operation != "boltz_predict"
        or result.version != evidence.writer_version
        or len(evidence.samples) != request.payload.samples
        or {sample.native_rank for sample in evidence.samples}
        != set(range(request.payload.samples))
        or sorted(sample.candidate_id for sample in evidence.samples)
        != sorted(row.id for row in result.candidates)
    ):
        raise ValueError("Native Boltz confidence belongs to another prediction.")
    candidates = {row.id: row for row in result.candidates}
    names = {evidence.mapping_artifact} if evidence.mapping_artifact else set()
    for sample in evidence.samples:
        if (
            sample.structure_artifact != candidates[sample.candidate_id].artifact
            or sample.structure_artifact != sample.candidate_id + ".cif"
        ):
            raise ValueError("Native Boltz confidence differs from the selected structure.")
        for field in ("pae", "pde", "plddt"):
            name = getattr(sample, field + "_artifact")
            if name is not None:
                if name != f"{sample.candidate_id}-{field}.npz":
                    raise ValueError("Native Boltz confidence references another sample.")
                names.add(name)
    if not names <= result.artifact_sha256.keys():
        raise ValueError("Native Boltz confidence lacks recorded file identities.")


def confidence_files(evidence, candidate=None):
    """Declared full scientific sources, for downloads and the inspection reader."""
    if evidence is None:
        return {}
    files = {}
    if evidence.mapping_artifact:
        files["confidence_mapping"] = evidence.mapping_artifact
    for sample in evidence.samples:
        if candidate is not None and sample.candidate_id != candidate:
            continue
        for field in ("pae", "pde", "plddt"):
            name = getattr(sample, field + "_artifact")
            if name is not None:
                files[f"{sample.candidate_id}_{field}"] = name
    return files
