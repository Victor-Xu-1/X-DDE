"""Typed, source-bound native quality decisions; a shortlist is not a pass set."""

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BinderDesignRow(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    native_id: str = Field(pattern=r"^design_[0-9]+\.cif$")
    candidate_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    sequence: str = Field(min_length=8, max_length=300, pattern=r"^[ACDEFGHIKLMNPQRSTVWY]+$")
    passed: bool
    failed_filters: list[str] = Field(max_length=100)
    interface_confidence: float = Field(ge=0, le=1)
    complex_confidence: float = Field(ge=0, le=1)
    binder_refold_confidence: float = Field(ge=0, le=1)
    binder_refold_rmsd: float = Field(ge=0)
    complex_refold_rmsd: float = Field(ge=0)
    buried_area: float = Field(ge=0)


class BinderQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_artifact: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    attempted: int = Field(ge=1, le=200)
    passed: int = Field(ge=0, le=200)
    retained: int = Field(ge=1, le=50)
    designs: list[BinderDesignRow] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def counts_match(self):
        if (
            self.attempted != len(self.designs)
            or self.passed != sum(row.passed for row in self.designs)
            or self.retained != sum(row.candidate_id is not None for row in self.designs)
        ):
            raise ValueError("Native binder quality totals differ from the full report.")
        return self
