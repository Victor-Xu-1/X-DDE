"""Supported inference switches for the pinned OpenDDE CLI."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Parameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seed: int = Field(default=101, ge=0, le=2**32 - 1)
    additional_seeds: list[int] = Field(default_factory=list, max_length=7)
    samples: int = Field(default=1, ge=1, le=8)
    steps: int = Field(default=200, ge=1, le=1000)
    cycles: int = Field(default=10, ge=1, le=20)
    dtype: Literal["bf16", "fp32"] = "bf16"
    model: Literal["standard", "abag"] = "standard"
    checkpoint_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    device: Literal["cuda", "cpu"] = "cuda"
    gpu_ids: list[int] = Field(default_factory=list, max_length=8)
    distributed: bool = False
    tfg: bool = False
    atom_confidence: bool = True
    triatt_kernel: Literal["auto", "cuequivariance", "torch"] = "auto"
    trimul_kernel: Literal["auto", "cuequivariance", "torch"] = "auto"
    enable_cache: bool = True
    enable_fusion: bool = True
    enable_tf32: bool = True
    deterministic: bool = False
    feature_mode: Literal["none", "uploaded", "search"] = "none"
    use_template: bool = False
    use_rna_msa: bool = False
    allow_network: bool = False
    search_cpus: int = Field(default=4, ge=1, le=32)

    @property
    def seeds(self) -> list[int]:
        return [self.seed, *self.additional_seeds]

    @model_validator(mode="after")
    def validate_combination(self) -> Self:
        if any(seed < 0 or seed > 2**32 - 1 for seed in self.seeds) or len(set(self.seeds)) != len(
            self.seeds
        ):
            raise ValueError("Random seeds must be distinct unsigned 32-bit integers.")
        if any(gpu < 0 or gpu > 63 for gpu in self.gpu_ids) or len(set(self.gpu_ids)) != len(
            self.gpu_ids
        ):
            raise ValueError("Select distinct nonnegative GPU indices.")
        if self.device == "cpu" and (
            self.distributed
            or self.gpu_ids
            or "cuequivariance" in {self.triatt_kernel, self.trimul_kernel}
        ):
            raise ValueError(
                "GPU selection, distributed execution and cuEquivariance require CUDA."
            )
        if self.distributed and (
            len(self.gpu_ids) < 2 or "cuequivariance" in {self.triatt_kernel, self.trimul_kernel}
        ):
            raise ValueError("Fold-CP requires at least two GPUs and auto/torch triangle kernels.")
        if self.feature_mode == "none" and (self.use_template or self.use_rna_msa):
            raise ValueError("Enable uploaded or searched features before templates/RNA MSA.")
        if self.feature_mode == "search" and not self.allow_network:
            raise ValueError(
                "Remote feature search requires explicit permission to transmit sequences."
            )
        return self
