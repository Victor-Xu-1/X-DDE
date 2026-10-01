"""Scientific scope is explicit; guided defaults never permit unnoticed CDR mutation."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HumanizationOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["evaluate", "framework"] = "evaluate"
    format: Literal["conventional", "vhh_exploratory"] = "conventional"
    iterations: int = Field(default=1, ge=1, le=4, strict=True)
    max_mutations: int = Field(default=0, ge=0, le=20, strict=True)
    cpu: int = Field(default=1, ge=1, le=2, strict=True)
    memory_mib: int = Field(default=4096, ge=2048, le=8192, strict=True)

    @model_validator(mode="after")
    def actual_scope(self):
        if self.mode == "evaluate" and (self.max_mutations or self.iterations != 1):
            raise ValueError("Sequence evaluation does not mutate or iterate the input.")
        if self.mode == "framework" and (not self.max_mutations or self.format != "conventional"):
            raise ValueError(
                "Framework proposals require a positive mutation budget "
                "and conventional VH/VL scope."
            )
        return self
